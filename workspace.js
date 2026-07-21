const ROLE_PERMISSIONS = Object.freeze({
  Owner: ["workspace.manage", "members.manage", "content.moderate", "messages.read_private", "messages.post"],
  Moderator: ["members.invite", "content.moderate", "messages.read_private", "messages.post"],
  Member: ["messages.read_public", "messages.post"],
  Guest: ["messages.read_public"],
});

function permissionsFor(role) {
  return [...(ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.Guest)];
}

function workspaceModel(community) {
  return {
    workspaceId: community.id,
    name: community.name,
    channels: community.channels.map((channel) => ({
      channelId: channel.id,
      name: channel.name,
      visibility: channel.type === "private" ? "private" : "public",
      posting: channel.posting || "all",
    })),
    memberships: community.members.map((member) => ({
      membershipId: member.id,
      displayName: member.name,
      role: member.role,
      status: member.status,
      permissions: permissionsFor(member.role),
    })),
  };
}

function can(member, permission) {
  return permissionsFor(member?.role).includes(permission);
}

function visibleMessages(community, member) {
  const privateChannels = new Set(
    community.channels.filter((channel) => channel.type === "private").map((channel) => channel.id),
  );
  return community.messages.filter((message) => !privateChannels.has(message.channelId) || can(member, "messages.read_private"));
}

module.exports = { ROLE_PERMISSIONS, can, permissionsFor, visibleMessages, workspaceModel };
