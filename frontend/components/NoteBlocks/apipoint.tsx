// services/projectApi.ts
import { store } from '../redux/store'; // Adjust path as needed

interface TeamMember {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
}

interface WorkItem {
  id: string;
  title: string;
  lastModified: string; 
  type: 'document' | 'note' | 'whiteboard';
  sessionId?: string;
  session_id?: string;
  last_modified: Date;
}

interface Topic {
  id: string;
  name: string;
  workItems: WorkItem[];
  work_items: WorkItem;
  isExpanded: boolean;
  color?: string;
}

interface ProjectList {
  id: string;
  name: string;
  type: 'personal' | 'group';
  members?: TeamMember[];
  topics: Topic[];
  isExpanded: boolean;
  icon?: string;
}

type WorkItemUpdate = {
  title?: string;
  last_modified?: string;
  session_id?: string;
  sessionId?: string;
};

class ProjectAPI {
  private baseURL: string;

  constructor(baseURL: string = 'http://localhost:8000/api') {
    this.baseURL = baseURL;
  }

  private getAccessToken(): string | null {
    const state = store.getState();
    return state.user?.accessToken || null;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const accessToken = this.getAccessToken();
    
    if (!accessToken) {
      throw new Error('No access token found. Please login first.');
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`, 
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    try {
      const response = await fetch(`${this.baseURL}${url}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTPS ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network request failed');
    }
  }

  // Project endpoints
  async getProjects(): Promise<{ success: boolean; projects: ProjectList[] }> {
    return this.request('/projects');
  }

  async createProject(name: string, type: 'personal' | 'group'): Promise<{ success: boolean; project: ProjectList }> {
    return this.request('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, type }),
    });
  }

  async updateProject(projectId: string, data: { name?: string; is_expanded?: boolean }): Promise<{ success: boolean }> {
    return this.request(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(projectId: string): Promise<{ success: boolean }> {
    return this.request(`/projects/${projectId}`, { method: 'DELETE' });
  }

  // Topic endpoints
  async createTopic(projectId: string, name: string): Promise<{ success: boolean; topic: Topic }> {
    return this.request(`/projects/${projectId}/topics`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async updateTopic(projectId: string, topicId: string, data: { name?: string; is_expanded?: boolean }): Promise<{ success: boolean }> {
    return this.request(`/projects/${projectId}/topics/${topicId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTopic(projectId: string, topicId: string): Promise<{ success: boolean }> {
    return this.request(`/projects/${projectId}/topics/${topicId}`, { method: 'DELETE' });
  }

  // Work item endpoints
  async createWorkItem(projectId: string, topicId: string, title: string, type: WorkItem['type']): Promise<{ success: boolean; work_item: WorkItem }> {
    return this.request(`/projects/${projectId}/topics/${topicId}/items`, {
      method: 'POST',
      body: JSON.stringify({ title, type }),
    });
  }

  async updateWorkItem(projectId: string, topicId: string, workItemId: string, data: WorkItemUpdate): Promise<{ success: boolean }> {
    return this.request(`/projects/${projectId}/topics/${topicId}/items/${workItemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteWorkItem(projectId: string, topicId: string, workItemId: string): Promise<{ success: boolean }> {
    return this.request(`/projects/${projectId}/topics/${topicId}/items/${workItemId}`, { method: 'DELETE' });
  }

  async addCollaborator(
    projectId: string, 
    email: string, 
    role: 'viewer' | 'editor' | 'admin'
  ): Promise<{ 
    success: boolean; 
    message: string; 
    collaborator: {
      id: string;
      email: string;
      username: string;
      role: string;
      status: string;
    }
  }> {
    return this.request(`/projects/${projectId}/collaborators/add`, {
      method: 'POST',
      body: JSON.stringify({ email, role, project_id: projectId }),
    });
  }
  
  async getProjectCollaborators(projectId: string): Promise<{
    success: boolean;
    collaborators: Array<{
      id: string;
      email: string;
      username: string;
      role: string;
      status: 'active';
    }>;
    owner: {
      id: string;
      email: string;
      username: string;
      role: 'owner';
      status: 'active';
    } | null;
    projectId:string,
    project_name: string;
    project_type: string;
  }> {
    return this.request(`/projects/${projectId}/collaborators`);
  }
  
  async updateCollaboratorRole(
    projectId: string, 
    collaboratorId: string, 
    role: 'viewer' | 'editor' | 'admin'
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/projects/${projectId}/collaborators/${collaboratorId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }
  
  async removeCollaborator(
    projectId: string, 
    collaboratorId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/projects/${projectId}/collaborators/${collaboratorId}`, {
      method: 'DELETE',
    });
  }
  
  async searchUsers(query: string, limit: number = 10): Promise<{
    success: boolean;
    users: Array<{
      id: string;
      email: string;
      username: string;
    }>;
  }> {
    return this.request(`/users/search?query=${encodeURIComponent(query)}&limit=${limit}`);
  }
}

// Create and export a singleton instance
const projectAPI = new ProjectAPI();

export default projectAPI;

// Also export the class if you need to create multiple instances
export { ProjectAPI };

// Export types for use in other files
export type {
  TeamMember,
  WorkItem,
  Topic,
  ProjectList,
  WorkItemUpdate
};