import { Routes, Route, useNavigate } from "react-router";
import { useEffect } from "react";
import SignIn from "./pages/AuthPages/SignIn";
import NotFound from "./pages/OtherPage/NotFound";
import UserProfiles from "./pages/users";
import LibrarySync from "./pages/librarySync";
import AppLayout from "./layout/AppLayout";
import Playlist from "./pages/playlist";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import UserProfilePage from "./pages/userProfile";
import ManualMarking from "./pages/manualMark";
import GenreMatch from "./pages/genreMatching";
import Import from "./pages/import";
import Notifications from "./pages/notification";
import Config from "./pages/config";
import Queue from "./pages/Jam/Queue";
import NowPlaying from "./pages/Jam/NowPlaying";
import JamUsers from "./pages/Jam/JamUsers";
// import SongPage from "./pages/songHistory";

import { fetchLogin, fetchGetUsers } from "./API/API";

import { useNotificationStream } from "./hooks/Usenotificationstream";

export default function App() {
  const navigate = useNavigate();

  useNotificationStream();

  useEffect(() => {
    const token =
      localStorage.getItem("tunelog_token") ||
      sessionStorage.getItem("tunelog_token");

    const username =
      localStorage.getItem("tunelog_user") ||
      sessionStorage.getItem("tunelog_user") ||
      "";
    const password =
      localStorage.getItem("tunelog_password") ||
      sessionStorage.getItem("tunelog_password") ||
      "";
    if (token) {
      return;
    }
    if (username && password) {
      fetchLogin({ username, password })
        .then(() => {
          fetchGetUsers({ admin: username, adminPD: password }).catch(() => {});
        })
        .catch(() => {
          navigate("/signin");
        });
      return;
    }
    navigate("/signin");
  }, [navigate]);

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index path="/" element={<Home />} />
          <Route path="/user" element={<UserProfiles />} />
          <Route path="/librarySync" element={<LibrarySync />} />
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

          {/* <Route path="/song/:songId" element={<SongPage />} /> */}
        </Route>

        <Route path="/signin" element={<SignIn />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
