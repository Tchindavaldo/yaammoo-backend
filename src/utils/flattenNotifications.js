function flattenNotifications(nestedNotifs) {
  const flat = [];

  nestedNotifs.forEach(parent => {
    const { allNotif, ...parentData } = parent;

    if (Array.isArray(allNotif)) {
      allNotif.forEach(child => {
        flat.push({
          ...parentData,
          ...child,
        });
      });
    }
  });

  return flat;
}

module.exports = { flattenNotifications };
