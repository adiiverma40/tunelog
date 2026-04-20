# this will be used to normalise the noisy genre data to a less noisy for better genre  injection in playlist

# Idea is to make user play match the following, hindi ost -> | -> bollywood
#
# to do that i m gonna use json to store it in /data folder


# use fuzzy matching to outmatically change genre of the highest matching genre

# ISSUES : IDK how to discribe, when fuzzy matching punjabi and punjabi pop both matches punjabi and pop with high fuzz  score creating this
# tunelog-backend   | Request recived to read data from json
# tunelog-backend   | File missing or corrupted. Resetting to default...
# tunelog-backend   | Request recived to read data from json
# tunelog-backend   | writng
# tunelog-backend   | writng
# tunelog-backend   | writng
# tunelog-backend   | Starting bulk update for : 1 Genre
# tunelog-backend   | [('pop', 'punjabi')]
# tunelog-backend   | writng
# tunelog-backend   | Starting bulk update for : 1 Genre
# tunelog-backend   | [('pop', 'punjabi')]
# tunelog-backend   | writng
# tunelog-backend   | Starting bulk update for : 1 Genre
# tunelog-backend   | [('pop', 'punjabi')]
# tunelog-backend   | writng
# tunelog-backend   | Starting bulk update for : 1 Genre
# tunelog-backend   | [('pop', 'punjabi')]
# tunelog-backend   | writng
# tunelog-backend   | writng
# tunelog-backend   | writng

# fix: stop looking if exact match or fuzzy score = 100


# data = {
#     "Bollywood": ["Hindi OST", "Hindi", "Bollywood Pop"],
#     "Hip-Hop": ["Rap", "RnB"],
#     "Unmapped": ["Bhangra", "Indie Rock"],
# }


import json
from rapidfuzz import fuzz
from misc import UpdateDBgenre
from db import get_db_connection, get_db_connection_lib, db_supervisor
from rich.console import Console

# from config import status_registry
from state import status_registry , tune_config

console = Console()

FILE_PATH = "./data/genre.json"


def writeJson(genre, noisyGenre):
    try:
        with open(FILE_PATH, "r") as file:
            raw_data = json.load(file)
            oldData = {
                k.lower(): [v.lower() for v in values] for k, values in raw_data.items()
            }
    except FileNotFoundError:
        console.print("[yellow]genre.json not found, creating fresh file.[/yellow]")
        oldData = {}
    except json.JSONDecodeError as e:
        console.print(f"[bold red]genre.json is corrupted:[/bold red] {e}. Resetting.")
        oldData = {}

    genre = genre.lower()
    noisyGenre = noisyGenre.lower()

    for values in oldData.values():
        if noisyGenre in values:
            return oldData

    if genre not in oldData:
        oldData[genre] = []

    oldData[genre].append(noisyGenre)

    try:
        with open(FILE_PATH, "w") as file:
            json.dump(oldData, file, indent=4)
    except OSError as e:
        console.print(f"[bold red]Failed to write genre.json:[/bold red] {e}")
        return oldData

    return oldData


def readJson(filePath = FILE_PATH ):
    default_data = {"app": "Tunelog"}

    try:
        with open(filePath, "r") as file:
            data = json.load(file)
    except FileNotFoundError:
        console.print("[yellow]genre.json missing. Resetting to default.[/yellow]")
        _write_default(default_data)
        data = default_data
    except json.JSONDecodeError as e:
        console.print(f"[bold red]genre.json corrupted:[/bold red] {e}. Resetting.")
        _write_default(default_data)
        data = default_data

    data.pop("app", None)
    return data


def _write_default(data):
    try:
        with open(FILE_PATH, "w") as file:
            json.dump(data, file, indent=4)
    except OSError as e:
        console.print(f"[bold red]Failed to reset genre.json:[/bold red] {e}")


def DeleteDataJson(category, value=None):
    try:
        with open(FILE_PATH, "r") as file:
            data = json.load(file)
    except FileNotFoundError:
        console.print("[bold red]ERROR:[/bold red] genre.json does not exist.")
        return None
    except json.JSONDecodeError as e:
        console.print(f"[bold red]genre.json corrupted:[/bold red] {e}")
        return None

    try:
        if value is None:
            if category not in data:
                console.print(f"[yellow]Category '{category}' not found.[/yellow]")
                return data
            del data[category]
            console.print(f"[green]Deleted category:[/green] {category}")
        else:
            if category not in data:
                console.print(f"[yellow]Category '{category}' not found.[/yellow]")
                return data
            if value not in data[category]:
                console.print(f"[yellow]Value '{value}' not in '{category}'.[/yellow]")
                return data
            data[category].remove(value)
            console.print(f"[green]Deleted[/green] '{value}' from '{category}'")

        with open(FILE_PATH, "w") as file:
            json.dump(data, file, indent=4)
        return data

    except OSError as e:
        console.print(
            f"[bold red]Failed to write genre.json after delete:[/bold red] {e}"
        )
        return None


def score(input, output):
    return round(fuzz.token_sort_ratio(input.lower(), output.lower()))


def autoGenre(data=None):
    if data is None:
        data = readJson()

    try:
        conn_lib = get_db_connection_lib()
        cursor = conn_lib.cursor()
        distinctGenre = cursor.execute(
            "SELECT DISTINCT genre FROM library WHERE explicit IS NOT NULL"
        ).fetchall()
        conn_lib.close()
    except Exception as e:
        console.print(f"[bold red]autoGenre: DB query failed:[/bold red] {e}")
        status_registry.update("sync", status="crashed", error=str(e))
        return {"status": "db_error", "updated_count": 0}

    genres = [row[0] for row in distinctGenre]
    mapping = []

    all_known_terms = set()
    for cat, vals in data.items():
        all_known_terms.add(cat.lower())
        for v in vals:
            all_known_terms.add(v.lower())

    for genre1 in genres:
        if not genre1 or genre1.lower() in all_known_terms:
            continue

        best_score = 0
        best_match = None

        for category, values in data.items():
            cat_lower = category.lower()
            genre_lower = genre1.lower()

            if len(cat_lower) > 3 and cat_lower in genre_lower:
                best_match = category
                best_score = 100
                break

            cat_score = score(category, genre1)
            if cat_score > best_score:
                best_score = cat_score
                best_match = category

            for value in values:
                if len(value) > 3 and value.lower() in genre_lower:
                    best_score = 100
                    best_match = category
                    break

                v_score = score(value, genre1)
                if v_score > best_score:
                    best_score = v_score
                    best_match = category

            if best_score == 100:
                break
        
        strictness = tune_config["api_and_performance"]["sync_confidence"]["genre_map_strictness"]
        
        if best_match and best_score >= strictness:
            console.print(
                f"[cyan]Auto-Mapping:[/cyan] {genre1} → {best_match} ({best_score}%)"
            )
            mapping.append((best_match, genre1))
            writeJson(best_match, genre1)

    if mapping:
        console.print(
            f"[bold green]Starting bulk update for {len(mapping)} genre(s)[/bold green]"
        )
        return {"updated_count": len(mapping)}

    console.print("[dim]autoGenre: No new mappings found.[/dim]")
    return {"status": "No changes needed", "updated_count": 0}


@db_supervisor
def _fetch_library_genres():
    conn_lib = get_db_connection_lib()
    cursor = conn_lib.cursor()
    genres = cursor.execute("SELECT DISTINCT genre FROM library").fetchall()
    conn_lib.close()
    return genres


@db_supervisor
def _apply_genre_updates(updates_to_make):
    return UpdateDBgenre(updates_to_make)


def sync_database_to_json():
    console.print("[bold green]Syncing genres to mapped genres...[/bold green]")
    data = readJson()

    genres = _fetch_library_genres()
    if genres is None:
        console.print(
            "[bold red]sync_database_to_json: Failed to fetch genres from DB.[/bold red]"
        )
        return {"status": "db_error"}

    genre_set = {g[0].strip().lower() for g in genres if g[0]}
    updates_to_make = []

    for category, values in data.items():
        category_clean = category.strip().lower()
        for value in values:
            value_clean = value.strip().lower()
            if value_clean == category_clean:
                continue
            if value_clean not in genre_set:
                continue
            updates_to_make.append((category_clean, value_clean))

    if not updates_to_make:
        console.print("[dim]Database already matches JSON categories.[/dim]")
        return {"status": "Database already matches JSON categories"}

    console.print(
        f"[bold green]Syncing DB:[/bold green] Found {len(updates_to_make)} mapping(s) to enforce."
    )

    result = _apply_genre_updates(updates_to_make)
    if result is None:
        console.print(
            "[bold red]sync_database_to_json: UpdateDBgenre failed after retries.[/bold red]"
        )
        return {"status": "update_error"}

    return result
