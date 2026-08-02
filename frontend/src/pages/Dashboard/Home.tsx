import { useState, useEffect } from "react";
// import { useNavigate } from "react-router";
import LibraryMetrics from "../../components/dashboardItems/LibraryMetrics";
import MonthlyPlayed from "../../components/dashboardItems/MonthlyPlayed";
import MostSkippedPercentage from "../../components/dashboardItems/MostSkippedPercentage";
import MostPlaysbyUser from "../../components/dashboardItems/MostPlaysbyUser";
import MostHeardArtist from "../../components/dashboardItems/MostHeardArtist";
import PageMeta from "../../components/common/PageMeta";
import { fetchStats, Stats, fetchGetUsers } from "../../API";
import MiniPlayer from "../Jam/MiniPlayer";

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetchGetUsers().catch(() => {});
    fetchStats().then((data) => setStats(data));
  }, []);

  return (
    <>
      <PageMeta
        title="Dashboard - Tunelog"
        description="Dashboard for tunelog and navidrome"
      />

      <div className="flex flex-col gap-5">
        <LibraryMetrics stats={stats} />
        <div className="grid grid-cols-12 gap-5" style={{ minHeight: "460px" }}>
          <div className="col-span-12 lg:col-span-5 h-full flex flex-col">
            <MostSkippedPercentage stats={stats} />
          </div>
          <div className="col-span-12 lg:col-span-7 h-full flex flex-col">
            <MostHeardArtist stats={stats} />
          </div>
        </div>
        <div className="grid grid-cols-12 gap-5" style={{ minHeight: "360px" }}>
          <div className="col-span-12 lg:col-span-6 h-full flex flex-col">
            <MonthlyPlayed />
          </div>
          <div className="col-span-12 lg:col-span-6 h-full flex flex-col">
            <MostPlaysbyUser />
          </div>
        </div>
      </div>

      <MiniPlayer />
    </>
  );
}
