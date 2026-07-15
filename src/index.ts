import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { todo } from "node:test";
import { z } from "zod";
import { describe } from "zod/v4/core";

interface Project {
	id: string;
	name: string;
	description: string;
	createdAt: string;
	updatedAt: string;
}

interface Todo {
	id: string;
	projectId: string;
	title: string;
	description: string;
	status: "pending" | "in_progress" | "completed";
	priority: "low" | "medium" | "high";
	createdAt: string;
	updatedAt: string;
}

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Project Planner MCP",
		version: "1.0.0",
	});

	// KV storage structure:
	// - project:list -> stores an array of all project IDs
	// - project:<projectId> -> stores the full project object
	// - project:<projectId>:todos -> stores an array of todo IDs belonging to a project
	// - todo:<todoId> -> stores the full todo object

	private get kv(): KVNamespace {
		return (this.env as Env).PROJECT_PLANNER_STORE;
	}

	// return a list of project IDs
	private async getProjectList(): Promise<string[]> {
		const listData = await this.kv.get("project:list");
		return listData ? JSON.parse(listData) : [];
	}

	// return a list of todo IDs for a given project ID
	private async getTodoList(projectId: string): Promise<string[]> {
		const listData = await this.kv.get(`project:${projectId}:todos`);
		return listData ? JSON.parse(listData) : [];
	}

	private async getTodoByProject(projectId: string): Promise<Todo[]> {
		const todoList = await this.getTodoList(projectId);
		const todos: Todo[] = [];

		for (const todoId of todoList) {
			const todoData = await this.kv.get(`todo:${todoId}`);
			if (todoData) {
				todos.push(JSON.parse(todoData));
			}
		}

		return todos;
	}

	async init(): Promise<void> {
		this.server.registerTool(
			"create_project",
			{
				title: "Create a project",
				description: "Create a new project",
				inputSchema: {
					name: z.string().describe("Project name"),
					description: z.string().optional().describe("Project description"),
				},
			},
			async ({ name, description }) => {
				const projectId = crypto.randomUUID();
				const project: Project = {
					id: projectId,
					name,
					description: description || "",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				};

				await this.kv.put(`project:${projectId}`, JSON.stringify(project));

				const projectList = await this.getProjectList();
				projectList.push(projectId);
				await this.kv.put("project:list", JSON.stringify(projectList));

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(project, null, 2),
						},
					],
				};
			},
		);

		this.server.registerTool(
			"list_projects",
			{
				title: "List All Projects",
				description: "List out all projects",
				inputSchema: {},
			},
			async () => {
				const projectList = await this.getProjectList();
				const projects: Project[] = [];

				for (const projectId of projectList) {
					const projectData = await this.kv.get(`project:${projectId}`);

					if (projectData) {
						projects.push(JSON.parse(projectData));
					}
				}

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(projects, null, 2),
						},
					],
				};
			},
		);

		this.server.registerTool(
			"get_project",
			{
				title: "Get a Project",
				description: "Get a project by ID",
				inputSchema: {
					project_id: z.string().describe("Project ID"),
				},
			},
			async ({ project_id }) => {
				const projectData = await this.kv.get(`project:${project_id}}`);

				if (!projectData) throw new Error(`Project with ID: ${project_id} not found.`);

				const project: Project = JSON.parse(projectData);
				const todos = await this.getTodoByProject(project_id);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ project, todos }, null, 2),
						},
					],
				};
			},
		);

		this.server.registerTool(
			"create_todo",
			{
				title: "Create ToDo",
				description: "Create a new todo in a project",
				inputSchema: {
					project_id: z.string().describe("Project ID"),
					title: z.string().describe("Todo title"),
					description: z.string().optional().describe("Todo description"),
					priority: z.enum(["low", "medium", "high"]).describe("Todo priority"),
				},
			},
			async ({ project_id, title, description, priority }) => {
				const projectData = await this.kv.get(`project:${project_id}`);

				if (!projectData)
					throw new Error(`Project with this id: ${project_id} }not found!`);

				const todoId = crypto.randomUUID();
				const todo: Todo = {
					id: todoId,
					projectId: project_id,
					title,
					description: description || "",
					status: "pending",
					priority: priority || "medium",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				};

				await this.kv.put(`todo:${todoId}`, JSON.stringify(todo));

				const todoList = await this.getTodoList(project_id);
				todoList.push(todoId);
				await this.kv.put(`todo:list`, JSON.stringify(todoList));

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(todo, null, 2),
						},
					],
				};
			},
		);

		this.server.registerTool(
			"delete_project",
			{
				title: "Delete Project and Todos",
				description: "Delete the project and its corresponding todo list",
				inputSchema: {
					project_id: z.string().describe("Project ID"),
				},
			},
			async ({ project_id }) => {
				const projectData = await this.kv.get(`project:${project_id}`);

				if (!projectData) throw new Error(`Project with this ID: ${project_id} not found`);

				// Delete the project
				await this.kv.delete(`project:${project_id}`);

				// Delete the project from project List
				const projectList = await this.getProjectList();
				projectList.filter((id) => id !== project_id);
				await this.kv.put(`project:list`, JSON.stringify(projectList));

				// Delete all todos
				const todos = await this.getTodoByProject(project_id);

				for (const todo of todos) {
					await this.kv.delete(`todo:${todo.id}`);
				}

				// Delete the project todo from todo List
				await this.kv.delete(`project:${project_id}:todos`);

				return {
					content: [
						{
							type: "text",
							text: `Project ${project_id} and all its todos have been deleted`,
						},
					],
				};
			},
		);

		this.server.registerTool(
			"update_todo",
			{
				title: "Update Todo",
				description: "Update the todo's properties",
				inputSchema: {
					todo_id: z.string().describe("Todo ID"),
					title: z.string().optional().describe("New todo title"),
					description: z.string().optional().describe("New todo description"),
					status: z
						.enum(["pending", "in_progress", "completed"])
						.optional()
						.describe("New todo status"),
					priority: z
						.enum(["low", "medium", "high"])
						.optional()
						.describe("New todo priority"),
				},
			},
			async ({ todo_id, title, description, status, priority }) => {
				const todoData = await this.kv.get(`todo:${todo_id}`);

				if (!todoData) throw new Error(`Todo with ID: ${todo_id} not found`);

				const todo: Todo = JSON.parse(todoData);

				if (title !== undefined) todo.title = title;
				if (description !== undefined) todo.description = description;
				if (status !== undefined) todo.status = status;
				if (priority !== undefined) todo.priority = priority;
				todo.updatedAt = new Date().toISOString();

				await this.kv.put(`todo:${todo_id}`, JSON.stringify(todo));

				return {
					content: [
						{
							type: "text",
							text: `The todo with id ${todo_id} has been updated`,
						},
					],
				};
			},
		);

		this.server.registerTool(
			"delete_todo",
			{
				title: "Delete Todo",
				description: "Delete the todo by todo id",
				inputSchema: {
					todo_id: z.string().describe("Todo ID"),
				},
			},
			async ({ todo_id }) => {
				const todoData = await this.kv.get(`todo:${todo_id}`);

				if (!todoData) throw new Error(`Todo with ID: ${todo_id} not found`);

				// Delete todo from KV database
				await this.kv.delete(`todo:${todo_id}`);

				// Delete todo from todo List
				const todo: Todo = JSON.parse(todoData);
				const todoList = await this.getTodoList(todo.projectId);
				const updatedTodoList = todoList.filter((todoId) => todoId !== todo_id);
				await this.kv.put(`project:${todo_id}:todos`, JSON.stringify(updatedTodoList));

				return {
					content: [
						{
							type: "text",
							text: `Deleted todo ID: ${todo_id}`,
						},
					],
				};
			},
		);

		this.server.registerTool(
			"get_todo",
			{
				title: "Get a Todo",
				description: "Get a specific todo by id",
				inputSchema: {
					todo_id: z.string().describe("Todo ID"),
				},
			},
			async ({ todo_id }) => {
				const todoData = await this.kv.get(`todo:${todo_id}`);
				if (!todoData) throw new Error(`Todo ${todo_id} not found`);
				const todo: Todo = JSON.parse(todoData);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(todo, null, 2),
						},
					],
				};
			},
		);

		this.server.registerTool(
			"list_todos",
			{
				title: "List Todos",
				description: "List all todos by project ID",
				inputSchema: {
					project_id: z.string().describe("Project ID"),
					status: z
						.enum(["pending", "in_progress", "completed", "all"])
						.optional()
						.describe("Filter by status"),
				},
			},
			async ({ project_id, status }) => {
				const projectData = await this.kv.get(`project:${project_id}`);
				if (!projectData) throw new Error(`Project ${project_id} not found`);

				const todoList = await this.getTodoByProject(project_id);
				if (status && status !== "all") {
					const filteredList = todoList.filter((todoObj) => todoObj.status === status);

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(filteredList),
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(todoList),
						},
					],
				};
			},
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
