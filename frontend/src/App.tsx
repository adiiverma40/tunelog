import { BrowserRouter as Router, Routes, Route } from "react-router";
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
import { useNotificationStream } from "./hooks/Usenotificationstream";
export default function App() {
  useNotificationStream()
  return (
    <>
      <Router>
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

            <Route path="/import" element={<Import />} />
          </Route>

          <Route path="/signin" element={<SignIn />} />
          {/* <Route path="/signup" element={<SignUp />} /> */}

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}
