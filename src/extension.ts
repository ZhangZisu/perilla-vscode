import { AxiosResponse, default as axios } from "axios";
import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import * as vscode from "vscode";
import atob = require("atob");
import createProblemViewRenderer from "./webview";
import { globalAgent } from "https";

globalAgent.options.rejectUnauthorized = false;

export async function activate(context: vscode.ExtensionContext) {
    function isTokenExpired(token: string) {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace("-", "+").replace("_", "/");
        const exp = JSON.parse(atob(base64)).exp;
        return exp < (+new Date()) / 1000;
    }

    function parseResponse(response: AxiosResponse<any>) {
        const { status, payload } = response.data;
        if (status !== "success") { throw new Error(payload); }
        return payload;
    }

    let loaded = false;

    async function loadConfig() {
        if (vscode.workspace.rootPath) {
            loaded = true;
            try {
                const configPath = join(vscode.workspace.rootPath, "perilla.config.json");
                if (!existsSync(configPath)) { return; }
                const { server, username } = JSON.parse(readFileSync(configPath).toString());
                axios.defaults.baseURL = server;
                try {
                    const { version } = parseResponse(await axios.get("/version"));
                    vscode.window.showInformationMessage("Connected to perilla " + version);
                } catch (e) {
                    vscode.window.showErrorMessage(e.message);
                    return;
                }
                let token = context.workspaceState.get("api_token") as string;
                if (!token || isTokenExpired(token)) {
                    const password = await vscode.window.showInputBox({
                        ignoreFocusOut: true,
                        placeHolder: "Your password",
                        prompt: "Please input password for " + username,
                        password: true,
                    });
                    token = parseResponse(await axios.post("/auth/login", { username, password }));
                    context.workspaceState.update("api_token", token);
                }
                axios.defaults.headers["x-access-token"] = token;
                vscode.window.showInformationMessage("Welcome, " + username);
            } catch (e) {
                vscode.window.showErrorMessage(e.message);
                loaded = false;
            }
        }
    }

    await loadConfig();

    context.subscriptions.push(vscode.commands.registerCommand("perillaVscode.enablePerilla", async () => {
        if (vscode.workspace.rootPath) {
            try {
                let server, username;
                const configPath = join(vscode.workspace.rootPath, "perilla.config.json");
                if (existsSync(configPath)) {
                    try {
                        ({ server, username } = require(configPath));
                    } catch (e) { }
                }
                server = await vscode.window.showInputBox({
                    ignoreFocusOut: true,
                    placeHolder: "https://perilla.zhangzisu.cn",
                    prompt: "Perilla server url",
                    value: server,
                });
                if (!server) { throw new Error("User cancel"); }
                username = await vscode.window.showInputBox({
                    ignoreFocusOut: true,
                    placeHolder: "User",
                    prompt: "Perilla username",
                    value: username,
                });
                if (!username) { throw new Error("User cancel"); }
                writeFileSync(configPath, JSON.stringify({ server, username }, null, "\t"));
                vscode.window.showInformationMessage("Configuration have save to perilla.config.json");
                await loadConfig();
            } catch (e) {
                vscode.window.showErrorMessage(e.message);
            }
        } else {
            vscode.window.showErrorMessage("Please open a workspace!");
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand("perillaVscode.viewProblem", async () => {
        if (!loaded) {
            vscode.window.showErrorMessage("Perilla not loaded!");
            return;
        }
        if (vscode.window.activeTextEditor && vscode.workspace.rootPath) {
            const relativePath = vscode.window.activeTextEditor.document.fileName.substr(vscode.workspace.rootPath.length);
            const [, entry, filename] = relativePath.replace(/\\/g, '/').split('/');
            const id = parseInt(filename.split('.')[0]);
            if (!entry || !id) {
                vscode.window.showErrorMessage("Invalid project structure");
                return;
            }
            try {
                const problem = parseResponse(await axios.get("/api/problem", { params: { entry, id } }));
                const panel = vscode.window.createWebviewPanel("problemview", `View problem #${id}`, vscode.ViewColumn.Beside);
                const renderer = createProblemViewRenderer(axios.defaults.baseURL, entry, axios.defaults.headers["x-access-token"]);
                const theme = vscode.workspace.getConfiguration().get("perillaVscode.lightTheme");
                panel.webview.html = renderer(problem, context, theme ? 'light' : 'dark');
            } catch (e) {
                vscode.window.showErrorMessage(e.message);
            }
        } else {
            vscode.window.showErrorMessage("Please open a text editor!");
        }
    }));
}

// this method is called when your extension is deactivated
export function deactivate() { }
