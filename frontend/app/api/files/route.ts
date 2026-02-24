import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { pythonUrl } from "../../../apiurl"
interface FileStructure {
  name: string;
  type: "file" | "folder";
  children?: FileStructure[];
  language?: string;
  value?: string;
  path: string;
}

async function readDirectory(dirPath: string): Promise<FileStructure[]> {
  const items = await fs.readdir(dirPath, { withFileTypes: true });
  const result = await Promise.all(
    items.map(async (item) => {
      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        const children = await readDirectory(fullPath);
        return {
          name: item.name,
          type: "folder",
          children,
          path: fullPath,
        };
      } else {
        return {
          name: item.name,
          type: "file",
          path: fullPath,
          language: path.extname(item.name).slice(1) || "plaintext",
        };
      }
    })
  );
  return result as FileStructure[];
}

async function fetchWorkspaceFromPython(workspaceId: string, authToken: string | null): Promise<FileStructure[] | null> {
    console.log(workspaceId, "workspaceId - fetching and restoring workspace")
    // This endpoint fetches from DB and restores to local filesystem automatically
    const pythonApiUrl = `${pythonUrl}/api/workspaces/${workspaceId}/content`;
    if (!authToken) {
        console.error("Auth token is missing, cannot call Python backend.");
        return null;
    }

    try {
        const response = await fetch(pythonApiUrl, {
            headers: { 'Authorization': `Bearer ${authToken}`, }
        });

        if (!response.ok) {
          console.log(response, "response")
            console.error(`Python API failed with status ${response.status}: ${await response.text()}`);
            return null;
        }
        
        const data = await response.json();

        // Validate the response structure
        if (!data || !Array.isArray(data.files)) {
            console.error("Invalid response structure from Python backend");
            return null;
        }

        // Convert flat list to tree structure
        const fileTree: FileStructure[] = [];
        const nodeMap: { [key: string]: FileStructure } = {};

        data.files.forEach((file: { path: string, content?: string }) => {
            const parts = file.path.split('/').filter(part => part.length > 0);
            let currentPath = '';

            parts.forEach((part, index) => {
                const parentPath = currentPath;
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                
                if (!nodeMap[currentPath]) {
                    const isFile = index === parts.length - 1;
                    const node: FileStructure = {
                        name: part,
                        type: isFile ? 'file' : 'folder',
                        path: currentPath,
                        ...(isFile && {
                            language: path.extname(part).slice(1) || 'plaintext',
                            value: file.content || ''
                        }),
                        ...(!isFile && { children: [] })
                    };

                    nodeMap[currentPath] = node;

                    // Add to parent's children or root
                    if (parentPath && nodeMap[parentPath]) {
                        nodeMap[parentPath].children!.push(node);
                    } else {
                        fileTree.push(node);
                    }
                }
            });
        });
        
        return fileTree;

    } catch (error) {
        console.error("Error calling Python backend:", error);
        return null;
    }
}

export async function POST(request: NextRequest) {
  let dirPath: string = '';
  let workspaceId: string = '';

  try {
    const body = await request.json();
    
    dirPath = body.path;
    workspaceId = body.workspaceId;

    if (!dirPath || !workspaceId) {
      return NextResponse.json({ error: "Both path and workspaceId are required" }, { status: 400 });
    }

    const authToken = request.headers.get('Authorization');

    // Try to read from filesystem first
    try {
      const files = await readDirectory(dirPath);
      console.log("Files loaded from filesystem successfully");
      return NextResponse.json({ files });
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        console.log(`Directory not found for ${workspaceId}. Fetching from Python backend (this will restore workspace)...`);
        
        // This call will:
        // 1. Fetch workspace data from DB
        // 2. Restore it to local filesystem
        // 3. Return the file structure
        const files = await fetchWorkspaceFromPython(workspaceId, authToken);
        
        if (files) {
          console.log("Workspace restored and files loaded from Python backend");
          return NextResponse.json({ files });
        } else {
          return NextResponse.json({ error: "Workspace not found or backend service failed." }, { status: 404 });
        }
      }
      throw error; // Re-throw if it's not ENOENT
    }

  } catch (error: unknown) {
    console.error("Error in files API:", error);
    return NextResponse.json({ error: "Failed to read directory" }, { status: 500 });
  }
}