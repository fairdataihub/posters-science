import type { DropdownMenuItem } from "@nuxt/ui";

/** The signed-in person's account menu, the avatar dropdown in the site header. */
export function useAccountMenu() {
  const { clear, user } = useUserSession();

  const logout = async () => {
    clear();
    await navigateTo("/");
  };

  const accountMenuItems = computed((): DropdownMenuItem[][] => [
    [
      {
        label: `${user?.value?.givenName} ${user?.value?.familyName}`,
        avatar: {
          src: `https://api.dicebear.com/9.x/shapes/svg?seed=${user?.value?.id}`,
        },
        type: "label",
      },
      {
        icon: "material-symbols:dashboard",
        label: "Dashboard",
        to: "/dashboard",
      },
      {
        // Your own profile page, public or private.
        icon: "material-symbols:account-circle",
        label: "Profile",
        to: "/profile/me",
      },
      {
        icon: "material-symbols:star",
        label: "Liked posters",
        to: "/liked",
      },
      {
        icon: "material-symbols:corporate-fare",
        label: "Organizations",
        to: "/organizations",
      },
      {
        icon: "material-symbols:collections-bookmark",
        label: "Collections",
        to: "/collections",
      },
      {
        icon: "material-symbols:settings",
        label: "Settings",
        to: "/profile",
      },
      ...(user?.value?.role === "admin"
        ? [
            {
              icon: "material-symbols:admin-panel-settings",
              label: "Admin",
              to: "/admin",
            },
          ]
        : []),
    ],
    [
      {
        icon: "majesticons:logout",
        label: "Logout",
        onSelect: logout,
      },
    ],
  ]);

  return { accountMenuItems, logout };
}
