export default defineNuxtRouteMiddleware(() => {
  const { loggedIn, user } = useUserSession();

  if (!loggedIn.value || user.value?.role !== "admin") {
    return navigateTo("/login");
  }
});
