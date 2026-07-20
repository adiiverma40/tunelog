from metadata.genre import readJson as readJSON
from navidrome.state import tune_config

from .base_playlist import (
    API_push_playlist,
    get_all_users,
    get_translation_maps,
    getDataFromDb,
    push_playlist,
)
from .blend_playlist import appendPlaylist, score_song
from .discovery_playlist import (
    build_discovery_playlist,
    get_discovery_pool,
    resolve_date_window,
)
from .import_playlist import fuzzymatching
from .listenbrainz_playlist import FetchCF, build_LB_CF_playlist


def run_blend(
    user_id, password, explicit_filter="notExplicit", size=None, injection=True
):
    """Build + push the 'Blend' playlist for a single user."""
    size = size or tune_config["playlist_generation"]["playlist_size"]
    return appendPlaylist(user_id, password, explicit_filter, size, injection)


def run_discovery(
    user_id,
    size,
    date_from=None,
    date_to=None,
    days_from=None,
    days_to=None,
    backtrack=True,
):
    """Build + push the 'Discovery' playlist for a single user."""
    window_start, window_end = resolve_date_window(
        date_from, date_to, days_from, days_to
    )
    _, history = getDataFromDb()
    alias_to_cat = get_translation_maps(readJSON())

    pool, backtracked, days_back = get_discovery_pool(
        window_start, window_end, size, backtrack
    )
    song_ids, song_signals = build_discovery_playlist(
        pool, history, user_id, size, alias_to_cat
    )

    push_playlist(song_ids, user_id, song_signals, playlist_type="discovery")
    return song_ids, song_signals


def run_listenbrainz_cf(user_id, cf_config):
    """Refresh ListenBrainz CF data, then build + push the CF playlist."""
    FetchCF()
    library, history = getDataFromDb()
    alias_to_cat = get_translation_maps(readJSON())
    standard_scores = score_song(user_id, library, history)

    song_ids, song_signals, heard_score, unheard_score = build_LB_CF_playlist(
        user_id, cf_config, history, alias_to_cat, standard_scores
    )

    push_playlist(song_ids, user_id, song_signals, playlist_type="listenbrainz_cf")
    return song_ids, song_signals, heard_score, unheard_score


def run_import(user_id, csv_path, playlist_name="New CSV Playlist"):
    """Fuzzy-match a CSV export against the library and push it as a playlist."""
    result = fuzzymatching(csv_path)
    if result is None:
        return None

    API_push_playlist(result["matched_ids"], user_id, playlist_name)
    return result


if __name__ == "__main__":
    for user in get_all_users():
        print(
            f"[entry_point] {user}: ready for run_blend / run_discovery / "
            f"run_listenbrainz_cf / run_import"
        )
