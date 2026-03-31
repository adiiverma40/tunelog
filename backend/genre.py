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
from db import get_db_connection , get_db_connection_lib


FILE_PATH = "./data/genre.json"
def writeJson(genre, noisyGenre):
    try:
        with open(FILE_PATH, "r") as file:

            raw_data = json.load(file)
            oldData = {
                k.lower(): [v.lower() for v in values] for k, values in raw_data.items()
            }
    except (FileNotFoundError, json.JSONDecodeError):
        oldData = {}

  
    genre = genre.lower()
    noisyGenre = noisyGenre.lower()

    
    for values in oldData.values():
        if noisyGenre in values:
            return oldData

    if genre not in oldData:
        oldData[genre] = []

   
    oldData[genre].append(noisyGenre)

   
    with open(FILE_PATH, "w") as file:
        json.dump(oldData, file, indent=4)  

    return oldData


def readJson():
    default_data = {"app": "Tunelog"}

    try:
        with open(FILE_PATH, "r") as file:
            data = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        print("File missing or corrupted. Resetting to default...")
        with open(FILE_PATH, "w") as file:
            json.dump(default_data, file, indent=4)
        data = default_data

    data.pop("app", None)

    return data


def DeleteDataJson(category, value = None):
    try:
        with open(FILE_PATH , "r") as file:
            data = json.load(file)

        if value is None :
            del data[category]
            print("Deleted the whole category : " , category)

        else:
            if value in data[category] :
                data[category].remove(value)
                print("Value : ", value ,"Delete from category : " , category)
            else:
                print("Value does not exist")

        with open(FILE_PATH , "w" ) as file:
            json.dump(data , file , indent=4 )
            return data

    except FileNotFoundError:
        print("ERROR : File does not exist")


def score(input , output):
    t_score = round(fuzz.token_sort_ratio(input.lower(), output.lower()))
    return round(t_score )


# changing autogenre just to write in json
def autoGenre(data = readJson()):
    conn_lib = get_db_connection_lib()
    cursor = conn_lib.cursor()
    distinctGenre = cursor.execute(
        "SELECT DISTINCT genre FROM library WHERE explicit IS NOT NULL"
    ).fetchall()
    conn_lib.close()

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

            if len(cat_lower) > 3: #
                if cat_lower in genre_lower:
                    best_match = category
                    best_score = 100 
                    break

            cat_score = score(category, genre1)
            if cat_score > best_score:
                best_score = cat_score
                best_match = category

            for value in values:
                v_score = score(value, genre1)

                if len(value) > 3 and value.lower() in genre_lower:
                    best_score = 100
                    best_match = category
                    break

                if v_score > best_score:
                    best_score = v_score
                    best_match = category

            if best_score == 100:
                break
        if best_match and best_score >= 95:
            print(f"Auto-Mapping Found: {genre1} -> {best_match} ({best_score}%)")

            mapping.append((best_match, genre1))

            writeJson(best_match, genre1)

    if mapping:
        print(f"Starting bulk update for : {len(mapping)} Genres")
        # db_result = UpdateDBgenre(mapping)
        return {"updated_count": len(mapping)}

    return {"status": "No changes needed", "updated_count": 0}



def sync_database_to_json():
    print("Syncing Genre to Mapped genre")
    data = readJson()
    conn_lib = get_db_connection_lib()
    cursor = conn_lib.cursor()
    genres = cursor.execute("SELECT DISTINCT genre FROM library").fetchall()
    conn_lib.close()
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
    if updates_to_make:
        print(f"Syncing DB: Found {len(updates_to_make)} mappings to enforce.")
        # print("Update to makes :", updates_to_make)
        return UpdateDBgenre(updates_to_make)
    else:
        return {"status": "Database already matches JSON categories"}
