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
