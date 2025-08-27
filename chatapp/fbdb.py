import firebase_admin
from firebase_admin import credentials, db

# Load service account key
cred = credentials.Certificate("D:\\Video\\chatapp\\login\\chat-app-c64df-firebase-adminsdk-fbsvc-4575a14d7a.json")
firebase_admin.initialize_app(cred, {
    "databaseURL": "https://chat-app-c64df-default-rtdb.firebaseio.com/"
})

# Reference path
ref = db.reference("users")

# Insert data
ref.push({
    "name": "Alice",
    "age": 25
})

# Read data
print(ref.get())

# Update data
ref.child("user123").update({"age": 26})

# Delete data
ref.child("user123").delete()
