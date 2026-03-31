import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import LibraryMetrics from "../../components/dashboardItems/LibraryMetrics";
import MonthlyPlayed from "../../components/dashboardItems/MonthlyPlayed";
import MostSkippedPercentage from "../../components/dashboardItems/MostSkippedPercentage";
import MostPlaysbyUser from "../../components/dashboardItems/MostPlaysbyUser";
import MostHeardArtist from "../../components/dashboardItems/MostHeardArtist";
import PageMeta from "../../components/common/PageMeta";
import { fetchLogin, fetchStats, Stats, fetchGetUsers } from "../../API/API";

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token =
      localStorage.getItem("tunelog_token") ||
      sessionStorage.getItem("tunelog_token");

    if (!token) {
      navigate("/signin");
      return;
    }

    const username =
      localStorage.getItem("tunelog_user") ||
      sessionStorage.getItem("tunelog_user") ||
      "";
    const password =
      localStorage.getItem("tunelog_password") ||
      sessionStorage.getItem("tunelog_password") ||
      "";

    if (username && password) {
      fetchLogin({ username, password })
        .then(() => {
          fetchGetUsers({ admin: username, adminPD: password }).catch(() => {});
        })
        .catch(() => {});
    }

    fetchStats().then((data) => setStats(data));
  }, []);

  return (
    <>
      <PageMeta
        title="Dashboard - Tunelog"
        description="Dashboard for tunelog and navidrome"
      />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 xl:col-span-8">
          <LibraryMetrics stats={stats} />
        </div>

        <div className="col-span-12 xl:col-span-4">
          <MostSkippedPercentage stats={stats} />
        </div>

        <div className="col-span-12 xl:col-span-7">
          <MostHeardArtist stats={stats} />
        </div>

        <div className="col-span-12 xl:col-span-5">
          <MonthlyPlayed />
        </div>

        <div className="col-span-12 xl:col-span-5">
          <MostPlaysbyUser />
        </div>
      </div>
    </>
  );
}
