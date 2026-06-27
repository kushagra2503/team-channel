import type { ParticipantStatus } from './participant';

export type ProjectStatus = 'active' | 'archived';

export type Project = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  displayName: string;
  status: ParticipantStatus;
  lastSeenAt: string;
};

export type CreateProjectRequest = {
  name: string;
  description?: string;
  /** When true (default), add the repo local user as the first project member. */
  addLocalUser?: boolean;
};

export type UpsertProjectMemberRequest = {
  displayName: string;
  status?: ParticipantStatus;
};
