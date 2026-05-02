# from db import get_db_connection , get_db_connection_lib 

# import db

# pat = db.DB_PATH_LOG

# def get_unplayed_playlist(history_db_file_path, days_ago=20):
#     conn = get_db_connection_lib()
#     cursor = conn.cursor()

#     try:
#         cursor.execute(f"ATTACH DATABASE '{history_db_file_path}' AS history_db")

#         query = f"""
#             SELECT lib.song_id, lib.title, lib.created
#             FROM library lib
#             WHERE NOT EXISTS (
#                 SELECT 1 
#                 FROM history_db.listens hist 
#                 WHERE hist.song_id = lib.song_id 
#             ) order by created desc limit 5;
#         """
        
#         cursor.execute(query)
#         playlist = cursor.fetchall()
#         readable_playlist = [dict(row) for row in playlist]
#         # 4. Detach when finished to release the lock on history_db
#         cursor.execute("DETACH DATABASE history_db")
        
#         return readable_playlist

#     except Exception as e:
#         print(f"Database error: {e}")
#         return []
        
#     finally:
#         # 5. Always ensure the primary connection is closed
#         conn.close()

# # Example usage:
# # new_playlist = get_unplayed_playlist('/path/to/your/history.db', 20)

# print(get_unplayed_playlist(pat))