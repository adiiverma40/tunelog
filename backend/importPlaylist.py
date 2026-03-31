import pandas as pd
from db import get_db_connection_lib
from rapidfuzz import fuzz
import re


def score(input, output):
    t_score = round(fuzz.token_set_ratio(input.lower(), output.lower()))
    return round(t_score)


def AlbumScoreFuzz(input, output):
    t_score = round(fuzz.token_sort_ratio(input.lower(), output.lower()))
    return round(t_score)


def readCSVdata(FILE_PATH):
    df = pd.read_csv(FILE_PATH)

    target_map_config = {
        "Track Name": ["Track Name", "Title", "Song", "Name"],
        "Album Name": ["Album Name", "Album", "Collection", "Record"],
        "Artist Name": ["Artist Name(s)", "Artist", "Band", "Singer", "Performer"],
        "Duration": ["Duration (ms)", "Duration", "Length", "Time"],
        "Explicit": ["Explicit", "Is Explicit", "Content Advisory", "Maturity"],
    }

    actual_columns = df.columns.tolist()
    column_map = {}
    THRESHOLD = 75

    for goal, aliases in target_map_config.items():
        best_match_for_goal = None
        highest_score_for_goal = 0

        for col in actual_columns:
            for alias in aliases:
                current_score = score(col, alias)

                if current_score > highest_score_for_goal:
                    highest_score_for_goal = current_score
                    best_match_for_goal = col

        if highest_score_for_goal >= THRESHOLD:
            column_map[goal] = best_match_for_goal
        else:
            print(
                "Warning: No match for ", goal, " Best score: ", highest_score_for_goal
            )
    df_subset = df[list(column_map.values())].copy()
    df_subset.columns = list(column_map.keys())
    return df_subset


def getSong():
    conn = get_db_connection_lib()
    cursor = conn.cursor()
    try:

        songs = cursor.execute(
            "SELECT song_id , title , artist , album , duration FROM library"
        ).fetchall()

        song_list = [dict(row) for row in songs]
        return song_list
    except Exception as e:
        print("database error ", e)

    finally:
        conn.close()


def clean_string(text):
    if not text or pd.isna(text):
        return ""
    text = re.sub(r"[\(\-]\s*From.*", "", str(text), flags=re.IGNORECASE)
    text = text.replace(";", " ").replace("&", " ").replace(",", " ").replace("•", " ")
    return " ".join(text.lower().split())

# v3
def fuzzymatching(filePath):
    df_csv = readCSVdata(filePath)
    db_songs = getSong()
    matched_ids = []
    results = []

    print(
        f"Starting Matcher: {len(df_csv)} CSV rows vs {len(db_songs)} DB rows"
    )
    n = 0

    NOT_ALBUM = clean_string("[Unknown Album]")
    NOT_ARTIST = clean_string("[Unknown Artist]")

    for index, csv_row in df_csv.iterrows():
        # Clean CSV Inputs
        CSVtitle = clean_string(csv_row["Track Name"])
        CSVartist = clean_string(csv_row["Artist Name"])
        CSValbum = clean_string(csv_row["Album Name"])
        CSVdur = int(csv_row["Duration"])

        best_match_candidate = None
        max_score = -1
        final_strategy = "None"
        row_matched = False
        row_song_id = None

        # print(
        #     f"\n{'='*80}\n SEARCHING FOR: \"{csv_row['Track Name']}\" | \"{csv_row['Artist Name']}\" | \"{csv_row['Album Name']}\""
        # )

        for db_song in db_songs:
            dbTitle = clean_string(db_song["title"])
            dbArtist = clean_string(db_song["artist"])
            dbAlbum = clean_string(db_song["album"])
            dDur_ms = int(db_song["duration"]) * 1000

            tScore = score(dbTitle, CSVtitle)
            aScore = score(dbArtist, CSVartist) if dbArtist != NOT_ARTIST else 0
            albScore = AlbumScoreFuzz(dbAlbum, CSValbum) if dbAlbum != NOT_ALBUM else 0
            dur_diff = abs(dDur_ms - CSVdur) / CSVdur * 100

            current_avg = (tScore + aScore + albScore) / 3

            match_found = False
            current_strategy = "None"

            # Strategy 1: Artist and Album are present
            if dbArtist != NOT_ARTIST and dbAlbum != NOT_ALBUM:
                if aScore >= 80 and albScore >= 80 and tScore >= 85:
                    match_found = True
                    current_strategy = "STRATEGY: [High Confidence Match (A+ALB+T)]"
                elif (
                    aScore >= 80
                    and albScore >= 80
                    and 70 <= tScore < 85
                    and dur_diff <= 10
                ):
                    match_found = True
                    current_strategy = "STRATEGY: [Duration Fallback (Artist/Album OK)]"
                elif aScore >= 80 and tScore >= 85 and dur_diff <= 10:
                    match_found = True
                    current_strategy = f"STRATEGY: [Artist-Heavy Match (A={aScore}, T={tScore}, D={round(dur_diff,2)}%)]"
                elif aScore >= 95 and tScore >= 95:
                    match_found = True
                    current_strategy = (
                        f"STRATEGY: [Strict Artist/Title Tie-break (No Album)]"
                    )

            # Strategy 2: Unknown Artist in DB
            elif dbArtist == NOT_ARTIST:
                if albScore >= 80 and tScore >= 80:
                    match_found = True
                    current_strategy = "STRATEGY: [Album/Title Match (Artist Unknown)]"

            # Strategy 3: Both unknown
            elif dbArtist == NOT_ARTIST and dbAlbum == NOT_ALBUM:
                if tScore >= 95 and dur_diff <= 5:
                    match_found = True
                    current_strategy = "STRATEGY: [Blind Title/Duration Match]"
            
            # Track the "Best" candidate for debug
            if current_avg > max_score:
                max_score = current_avg
                best_match_candidate = {
                    "title": dbTitle,
                    "artist": dbArtist,
                    "album": dbAlbum,
                    "t": tScore,
                    "a": aScore,
                    "alb": albScore,
                    "dur_p": dur_diff,
                    "dur_ms": dDur_ms,
                }
                final_strategy = (
                    current_strategy if match_found else "N/A - Below Thresholds"
                )

            if match_found:
                row_matched = True
                row_song_id = db_song["song_id"]
                # print(f' FOUND MATCH: "{dbTitle}" by "{dbArtist}" in "{dbAlbum}"')
                # print(f"   {current_strategy}")
                # print(
                #     f"   Scores -> Title: {tScore} | Artist: {aScore} | Album: {albScore} | DurDiff: {round(dur_diff, 2)}%"
                # )
                break

        # if not row_matched:
        #     print(f" REJECTED: Could not find a reliable match.")
        #     if best_match_candidate:
        #         print(f"   BEST FAILED CANDIDATE:")
        #         print(f"   DB Title: \"{best_match_candidate['title']}\"")
        #         print(f"   DB Artist: \"{best_match_candidate['artist']}\"")
        #         print(f"   DB Album: \"{best_match_candidate['album']}\"")
        #         print(
        #             f"   SCORES: Title: {best_match_candidate['t']} | Artist: {best_match_candidate['a']} | Album: {best_match_candidate['alb']}"
        #         )
        #         print(
        #             f"   DUR: CSV({CSVdur}ms) vs DB({best_match_candidate['dur_ms']}ms) | Diff: {round(best_match_candidate['dur_p'], 2)}%"
        #         )
        #         print(f"   REJECTION NOTE: {final_strategy}")
        #     else:
        #         print("   No candidates were even evaluated.")

        results.append(
            {
                "title": csv_row["Track Name"],
                "artist": csv_row["Artist Name"],
                "found": row_matched,
                "song_id": row_song_id,
            }
        )
        if row_matched:
            matched_ids.append(row_song_id)
            n += 1

    summary = {"total": len(df_csv), "matched": n, "not_found": len(df_csv) - n}
    print(f"\nFINAL SUMMARY: Matched {n}/{len(df_csv)} tracks.\n")
    return {"matched_ids": matched_ids, "results": results, "summary": summary}


if __name__ == "__main__":
    results = fuzzymatching("./data/data3.csv")
    # print("\nResulting IDs:", results

    #       )


# v1
# def fuzzymatching(filePath):
#     df_csv = readCSVdata(filePath)
#     db_songs = getSong()
#     matched_ids = []
#     results = []
#     MATCH_THRESHOLD = 75
#     TIME_TOLERANCE_MS = 3000
#     print(
#         f"--- Starting Matcher: {len(df_csv)} CSV rows vs {len(db_songs)} DB rows ---"
#     )
#     n = 0
#     for index, csv_row in df_csv.iterrows():
#         best_match_id = None
#         highest_combined_score = 0
#         best_details = ""
#         CSVtitle = clean_string(csv_row["Track Name"])
#         CSVartist = clean_string(csv_row["Artist Name"])
#         CSValbum = clean_string(csv_row["Album Name"])
#         CSVdur = int(csv_row["Duration"])
#         notAlbum = clean_string("[Unknown Album]")
#         notArtist = clean_string("[Unknown Artist]")

#         row_matched = False
#         row_song_id = None

#         for db_song in db_songs:
#             dbTitle = clean_string(db_song["title"])
#             dbArtist = clean_string(db_song["artist"])
#             dDur_ms = int(db_song["duration"]) * 1000
#             dbAlbum = clean_string(db_song["album"])

#             titleScore = score(dbTitle, CSVtitle)
#             if dbArtist != notArtist:
#                 aritstScore = score(dbArtist, CSVartist)
#             if dbAlbum != notAlbum:
#                 albumScore = AlbumScoreFuzz(dbAlbum, CSValbum)
#             dur_diff_percent = abs(dDur_ms - CSVdur) / CSVdur * 100

#             if dbAlbum != notAlbum and dbArtist != notArtist:
#                 if aritstScore >= 80 and albumScore >= 80:
#                     if titleScore >= 75:
#                         print("=================")
#                         print(
#                             "Db title  :  ",
#                             dbTitle,
#                             "csv title : ",
#                             CSVtitle,
#                             " |score  : ",
#                             titleScore,
#                         )
#                         print(
#                             "Db artist  :  ",
#                             dbArtist,
#                             "csv artist : ",
#                             CSVartist,
#                             " |score  : ",
#                             aritstScore,
#                         )
#                         print(
#                             "Db album  :  ",
#                             dbAlbum,
#                             "csv album : ",
#                             CSValbum,
#                             " |score  : ",
#                             albumScore,
#                         )
#                         print("=================")
#                         n += 1
#                         row_matched = True
#                         row_song_id = db_song["song_id"]
#                     elif 70 <= titleScore < 75 and dur_diff_percent <= 10:
#                         print("================= [Duration Fallback]")
#                         print(
#                             "Db title  :  ",
#                             dbTitle,
#                             "csv title : ",
#                             CSVtitle,
#                             " |score  : ",
#                             titleScore,
#                         )
#                         print(
#                             "Db artist  :  ",
#                             dbArtist,
#                             "csv artist : ",
#                             CSVartist,
#                             " |score  : ",
#                             aritstScore,
#                         )
#                         print(
#                             "Db album  :  ",
#                             dbAlbum,
#                             "csv album : ",
#                             CSValbum,
#                             " |score  : ",
#                             albumScore,
#                         )
#                         print(
#                             "Dur diff  :  ",
#                             round(dur_diff_percent, 2),
#                             "% | CSV:",
#                             CSVdur,
#                             "ms | DB:",
#                             dDur_ms,
#                             "ms",
#                         )
#                         print("=================")
#                         n += 1
#                         row_matched = True
#                         row_song_id = db_song["song_id"]

#             if dbAlbum == notAlbum:
#                 if aritstScore >= 80 and titleScore >= 80:
#                     if dDur_ms == CSVdur:
#                         print("=================")
#                         print(
#                             "Db title  :  ",
#                             dbTitle,
#                             "csv title : ",
#                             CSVtitle,
#                             " |score  : ",
#                             titleScore,
#                         )
#                         print(
#                             "Db artist  :  ",
#                             dbArtist,
#                             "csv artist : ",
#                             dbArtist,
#                             " |score  : ",
#                             aritstScore,
#                         )
#                         print("=================")
#                         row_matched = True
#                         row_song_id = db_song["song_id"]
#                     elif (
#                         aritstScore >= 80
#                         and 70 <= titleScore < 80
#                         and dur_diff_percent <= 10
#                     ):
#                         print("================= [Duration Fallback]")
#                         print(
#                             "Db title  :  ",
#                             dbTitle,
#                             "csv title : ",
#                             CSVtitle,
#                             " |score  : ",
#                             titleScore,
#                         )
#                         print(
#                             "Db artist  :  ",
#                             dbArtist,
#                             "csv artist : ",
#                             dbArtist,
#                             " |score  : ",
#                             aritstScore,
#                         )
#                         print(
#                             "Dur diff  :  ",
#                             round(dur_diff_percent, 2),
#                             "% | CSV:",
#                             CSVdur,
#                             "ms | DB:",
#                             dDur_ms,
#                             "ms",
#                         )
#                         print("=================")
#                         row_matched = True
#                         row_song_id = db_song["song_id"]

#             if dbArtist == notArtist:
#                 if albumScore >= 80 and titleScore >= 80:
#                     if dDur_ms == CSVdur:
#                         print("=================")
#                         print(
#                             "Db title  :  ",
#                             dbTitle,
#                             "csv title : ",
#                             CSVtitle,
#                             " |score  : ",
#                             titleScore,
#                         )
#                         print(
#                             "Db album  :  ",
#                             dbAlbum,
#                             "csv album : ",
#                             CSValbum,
#                             " |score  : ",
#                             albumScore,
#                         )
#                         print("=================")
#                         row_matched = True
#                         row_song_id = db_song["song_id"]
#                     elif (
#                         albumScore >= 80
#                         and 70 <= titleScore < 80
#                         and dur_diff_percent <= 10
#                     ):
#                         print("================= [Duration Fallback]")
#                         print(
#                             "Db title  :  ",
#                             dbTitle,
#                             "csv title : ",
#                             CSVtitle,
#                             " |score  : ",
#                             titleScore,
#                         )
#                         print(
#                             "Db album  :  ",
#                             dbAlbum,
#                             "csv album : ",
#                             CSValbum,
#                             " |score  : ",
#                             albumScore,
#                         )
#                         print(
#                             "Dur diff  :  ",
#                             round(dur_diff_percent, 2),
#                             "% | CSV:",
#                             CSVdur,
#                             "ms | DB:",
#                             dDur_ms,
#                             "ms",
#                         )
#                         print("=================")
#                         row_matched = True
#                         row_song_id = db_song["song_id"]

#             if dbArtist == notArtist and dbAlbum == notAlbum:
#                 if titleScore >= 80:
#                     if dDur_ms == CSVdur:
#                         print("=================")
#                         print(
#                             "Db title  :  ",
#                             dbTitle,
#                             "csv title : ",
#                             CSVtitle,
#                             " |score  : ",
#                             titleScore,
#                         )
#                         print("=================")
#                         row_matched = True
#                         row_song_id = db_song["song_id"]
#                     elif 70 <= titleScore < 80 and dur_diff_percent <= 10:
#                         print("================= [Duration Fallback]")
#                         print(
#                             "Db title  :  ",
#                             dbTitle,
#                             "csv title : ",
#                             CSVtitle,
#                             " |score  : ",
#                             titleScore,
#                         )
#                         print(
#                             "Dur diff  :  ",
#                             round(dur_diff_percent, 2),
#                             "% | CSV:",
#                             CSVdur,
#                             "ms | DB:",
#                             dDur_ms,
#                             "ms",
#                         )
#                         print("=================")
#                         row_matched = True
#                         row_song_id = db_song["song_id"]
#         results.append(
#             {
#                 "title": csv_row["Track Name"],
#                 "artist": csv_row["Artist Name"],
#                 "found": row_matched,
#                 "song_id": row_song_id,
#             }
#         )
#         if row_matched and row_song_id:
#             matched_ids.append(row_song_id)
#     summary = {"total": len(df_csv), "matched": n, "not_found": len(df_csv) - n}
#     return {"matched_ids": matched_ids, "results": results, "summary": summary}

# v2
# def fuzzymatching(filePath):
#     df_csv = readCSVdata(filePath)
#     db_songs = getSong()
#     matched_ids = []
#     results = []

#     print(
#         f"--- Starting Matcher: {len(df_csv)} CSV rows vs {len(db_songs)} DB rows ---"
#     )
#     n = 0

#     # Constants
#     NOT_ALBUM = clean_string("[Unknown Album]")
#     NOT_ARTIST = clean_string("[Unknown Artist]")

#     for index, csv_row in df_csv.iterrows():
#         CSVtitle = clean_string(csv_row["Track Name"])
#         CSVartist = clean_string(csv_row["Artist Name"])
#         CSValbum = clean_string(csv_row["Album Name"])
#         CSVdur = int(csv_row["Duration"])

#         best_match_candidate = None
#         max_score = -1
#         rejection_reason = "No DB songs processed"
#         row_matched = False
#         row_song_id = None

#         print(
#             f"\n>>> PROCESSING: '{csv_row['Track Name']}' by '{csv_row['Artist Name']}'"
#         )

#         for db_song in db_songs:
#             dbTitle = clean_string(db_song["title"])
#             dbArtist = clean_string(db_song["artist"])
#             dbAlbum = clean_string(db_song["album"])
#             dDur_ms = int(db_song["duration"]) * 1000

#             # Calculate Scores
#             tScore = score(dbTitle, CSVtitle)
#             aScore = score(dbArtist, CSVartist) if dbArtist != NOT_ARTIST else 0
#             albScore = AlbumScoreFuzz(dbAlbum, CSValbum) if dbAlbum != NOT_ALBUM else 0
#             dur_diff = abs(dDur_ms - CSVdur) / CSVdur * 100

#             # Calculate a combined metric for "Best Candidate" tracking
#             current_avg = (tScore + aScore + albScore) / 3

#             # Internal Matching Logic (Simplified into a check)
#             match_found = False
#             current_reason = ""

#             # Logic block for matches
#             if dbAlbum != NOT_ALBUM and dbArtist != NOT_ARTIST:
#                 if aScore >= 80 and albScore >= 80:
#                     if tScore >= 85:
#                         match_found = True
#                         current_reason = "High confidence match (Title/Artist/Album)"
#                     elif 70 <= tScore < 75 and dur_diff <= 10:
#                         match_found = True
#                         current_reason = "Duration fallback match (Artist/Album OK)"
#                 elif aScore >= 80 :
#                     if tScore >= 85 and dur_diff <= 10:
#                         match_found = True
#                         current_reason = f"artist Score  : {aScore} title score : {tScore} dur diff : {dur_diff}"
#                 elif aScore >= 95 and tScore >= 95 :
#                     # if tScore >= 85 and dur_diff <= 10:
#                     match_found = True
#                     current_reason = f"artist Score  : {aScore} title score : {tScore} dur diff : {dur_diff}"

#                     # elif 70 <= tScore < 75
#                     #     match_found = True
#                     #     current_reason = "Duration fallback match (Artist/Album OK)"
#                 else:
#                     current_reason = (
#                         f"Artist({aScore}) or Album({albScore}) below threshold 80"
#                     )

#             elif dbArtist == NOT_ARTIST:
#                 if albScore >= 80 and tScore >= 80:
#                     match_found = True
#                     current_reason = "Artist unknown; Title/Album match"
#                 else:
#                     current_reason = (
#                         f"Unknown Artist; Album({albScore}) or Title({tScore}) low"
#                     )

#             # Track the "Best" even if it's not a match yet
#             if current_avg > max_score:
#                 max_score = current_avg
#                 best_match_candidate = {
#                     "title": dbTitle,
#                     "artist": dbArtist,
#                     "t": tScore,
#                     "a": aScore,
#                     "alb": albScore,
#                     "dur_p": dur_diff,
#                 }
#                 if not match_found:
#                     rejection_reason = current_reason

#             if match_found:
#                 row_matched = True
#                 row_song_id = db_song["song_id"]
#                 print(
#                     f" ✅ MATCHED: '{dbTitle}' | Score: {tScore} | Reason: {current_reason}"
#                 )
#                 break  # Stop searching DB for this CSV row

#         if not row_matched:
#             print(f" ❌ REJECTED: No suitable match found.")
#             if best_match_candidate:
#                 print(
#                     f"    Closest was: '{best_match_candidate['title']}' by '{best_match_candidate['artist']}'"
#                 )
#                 print(
#                     f"    Scores -> Title: {best_match_candidate['t']}, Artist: {best_match_candidate['a']}, Album: {best_match_candidate['alb']}, DurDiff: {round(best_match_candidate['dur_p'], 2)}%"
#                 )
#                 print(f"    Failure Reason: {rejection_reason}")

#         results.append(
#             {
#                 "title": csv_row["Track Name"],
#                 "artist": csv_row["Artist Name"],
#                 "found": row_matched,
#                 "song_id": row_song_id,
#             }
#         )

#         if row_matched:
#             matched_ids.append(row_song_id)
#             n += 1

#     summary = {"total": len(df_csv), "matched": n, "not_found": len(df_csv) - n}
#     print(f"\n--- Done: Matched {n}/{len(df_csv)} ---")
#     return {"matched_ids": matched_ids, "results": results, "summary": summary}
