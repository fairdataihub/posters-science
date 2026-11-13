// After Sign in with ORCID, the server sends people on to where they were going
// with ?orcid=signedin added. Count the sign in, then drop the marker.
export default defineNuxtPlugin(() => {
  const router = useRouter();

  router.isReady().then(() => {
    const route = router.currentRoute.value;

    if (route.query.orcid !== "signedin") return;

    // The Umami script loads asynchronously, so give it a few seconds.
    let attempts = 0;
    const track = () => {
      if (window.umami) {
        window.umami.track("login_completed", { method: "orcid" });
      } else if (attempts++ < 10) {
        setTimeout(track, 500);
      }
    };

    track();

    const { orcid: _orcid, ...query } = route.query;

    router.replace({ query, hash: route.hash });
  });
});
