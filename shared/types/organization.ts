export type OrganizationRole = "owner" | "member";

/** An organization as one of its members sees it. */
export type MyOrganization = {
  id: string;
  path: string;
  avatarUrl: string;
  name: string;
  description: string;
  websiteUrl: string;
  profilePublic: boolean;
  hidden: boolean;
  hiddenReason: string;
  role: OrganizationRole;
  memberCount: number;
  posterCount: number;
  created: string;
};

/** How a person holds a poster they can show on an organization page. */
export type OrganizationListingRole = "publisher" | "author";

/** One of the signed-in person's organizations, as the poster picker shows it. */
export type PosterOrganizationChoice = {
  id: string;
  name: string;
  path: string;
  avatarUrl: string;
  /** Null once the person has left. They can still take their listing off. */
  role: OrganizationRole | null;
  isPublic: boolean;
  hidden: boolean;
  /** The poster is on this organization's page, whoever added it. */
  listed: boolean;
  /** The signed-in person added it, so they can take it off again here. */
  addedByMe: boolean;
};

export type PosterOrganizationChoices = {
  /** Always the version root. */
  posterId: number;
  /** False when the poster isn't published, is retired, or isn't theirs. */
  canList: boolean;
  organizations: PosterOrganizationChoice[];
};

export type OrganizationListedPoster = {
  posterId: number;
  title: string;
  imageUrl: string;
  addedAt: string;
  addedByMe: boolean;
  canRemove: boolean;
};

export type OrganizationAvailablePoster = {
  posterId: number;
  title: string;
  imageUrl: string;
  role: OrganizationListingRole;
  publishedAt: string | null;
};

/** An organization's posters, as one of its members manages them. */
export type OrganizationPosters = {
  listed: OrganizationListedPoster[];
  /** The member's own posters that aren't on the page yet. */
  available: OrganizationAvailablePoster[];
};

/** Which of the signed-in person's posters each of their organizations shows. */
export type MyOrganizationListings = {
  /** Includes organizations the person left that still show their posters. */
  organizations: (Pick<MyOrganization, "id" | "name" | "path" | "avatarUrl"> & {
    role: OrganizationRole | null;
  })[];
  listings: { organizationId: string; posterId: number }[];
};

/** A member of an organization, as the other members see them. */
export type OrganizationTeamMember = {
  userId: string;
  name: string;
  /** Only owners see addresses, so they can tell people apart. */
  emailAddress: string | null;
  role: OrganizationRole;
  joined: string;
  isMe: boolean;
  /** Set when the person has made their own profile public. */
  profilePath: string | null;
};

/** An invite an owner has sent that hasn't been answered yet. */
export type OrganizationSentInvite = {
  id: string;
  emailAddress: string;
  invitedByName: string;
  sentAt: string;
  expiresAt: string;
  /** The email can be sent again from this time. */
  resendAvailableAt: string;
};

/** An organization's members, plus its pending invites for owners. */
export type OrganizationTeam = {
  role: OrganizationRole;
  ownerCount: number;
  members: OrganizationTeamMember[];
  /** Always empty for members who aren't owners. */
  invites: OrganizationSentInvite[];
  /** How many invites can be pending at once. */
  inviteLimit: number;
};

/** An invite waiting for the signed-in person. */
export type MyOrganizationInvite = {
  id: string;
  organizationName: string;
  organizationPath: string;
  organizationAvatarUrl: string;
  invitedByName: string;
  sentAt: string;
  expiresAt: string;
};
