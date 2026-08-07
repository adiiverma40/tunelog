import { Routes, Route, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import SignIn from "./pages/AuthPages/SignIn";
import NotFound from "./pages/OtherPage/NotFound";
import UserProfiles from "./pages/users/users";
import LibrarySync from "./pages/librarySync/librarySync";
import Playlist from "./pages/playlist/playlist";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import UserProfilePage from "./pages/users/userProfile";
import ManualMarking from "./pages/tweaks/manualMark";
import GenreMatch from "./pages/tweaks/genreMatching";
import Import from "./pages/librarySync/import";
import Notifications from "./pages/tweaks/notification";
import Config from "./pages/tweaks/config";
import Queue from "./pages/Jam/Queue";
import NowPlaying from "./pages/Jam/NowPlaying";
import JamUsers from "./pages/Jam/JamUsers";
import { fetchGetUsers, CheckAuth } from "./API";
import { useNotificationStream } from "./hooks/Usenotificationstream";
import ListenBrainzImport from "./pages/scrobble/listenbrainz";
import ListenbrainzCF from "./pages/playlist/LB_CF";
import ListenbrainzLibrary from "./pages/librarySync/listenbrainz";
import SkippedSongs from "./pages/Library/skipped";

import { WhatsNewModal } from "./pages/changelog";

export default function App() {
  const navigate = useNavigate();
  useNotificationStream();
  useEffect(() => {
    const verifyUser = async () => {
      const auth = await CheckAuth();
      console.log(auth);
      fetchGetUsers().catch(() => {});
      if (!auth) {
        navigate("/signin");
        return;
      }
    };
    verifyUser();
  }, [navigate]);

  return (
    <>
      <WhatsNewModal/>
      <ScrollToTop />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index path="/" element={<Home />} />
          <Route path="/user" element={<UserProfiles />} />
          <Route path="/librarySync" element={<LibrarySync />} />

          <Route
            path="/library/listenbrainz"
            element={<ListenbrainzLibrary />}
          />
          <Route path="/playlist" element={<Playlist />} />
          <Route path="/users/:username" element={<UserProfilePage />} />
          <Route path="/manual" element={<ManualMarking />} />
          <Route path="/genre" element={<GenreMatch />} />
          <Route path="/notification" element={<Notifications />} />
          <Route path="/config" element={<Config />} />
          <Route path="/nowplaying" element={<NowPlaying />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/import" element={<Import />} />
          <Route path="/jamuser" element={<JamUsers />} />

          <Route path="/library/skipped" element={<SkippedSongs />} />
          <Route
            path="/playlist/listenbrainz/cf"
            element={<ListenbrainzCF />}
          />

          <Route
            path="/scrobble/listenbrainz"
            element={<ListenBrainzImport />}
          />
        </Route>

        <Route path="/signin" element={<SignIn />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
