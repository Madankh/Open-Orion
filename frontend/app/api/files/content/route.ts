import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { pythonUrl } from "../../../../apiurl"
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path, workspaceId } = body;

    if (!path) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "WorkspaceId is required" }, { status: 400 });
    }

    // Try to read from filesystem first
    try {
      const content = await fs.readFile(path, "utf-8");
      console.log("File content loaded from filesystem");
      return NextResponse.json({ content });
    } catch (fsError: unknown) {
      const error = fsError as NodeJS.ErrnoException;
      console.error("Failed to read from filesystem:", error.message);
      
      // If file not found in filesystem, fetch from Python backend
      // This will restore the workspace if it's not already restored
      if (error.code === 'ENOENT') {
        return await fetchFromPythonBackend(workspaceId, path, request);
      }
      
      throw fsError;
    }
   
  } catch (error: unknown) {
    console.error("Error in file content API:", error);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}

// Fetch from Python backend (this will restore workspace if needed)
async function fetchFromPythonBackend(workspaceId: string, filePath: string, request: NextRequest) {
  const authToken = request.headers.get('Authorization');
  
  if (!authToken) {
    console.error("Auth token is missing, cannot call Python backend.");
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    // This endpoint will restore workspace from DB if not already restored
    const pythonApiUrl = `${pythonUrl}/api/workspaces/${workspaceId}/content`;
    
    const response = await fetch(pythonApiUrl, {
      method: 'POST',
      headers: {
         'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: filePath })
    });

    if (!response.ok) {
      console.error(`Python backend failed with status ${response.status}: ${await response.text()}`);
      return NextResponse.json({ error: "Failed to fetch file content from backend" }, { status: response.status });
    }
    
    const data = await response.json();
    console.log("File content loaded from Python backend (workspace restored if needed)");
    return NextResponse.json({ content: data.content || '' });
   
  } catch (error) {
    console.error("Error calling Python backend:", error);
    return NextResponse.json({ error: "Backend service unavailable" }, { status: 503 });
  }
}