import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# Load service account key
cred = credentials.Certificate("D:\\Video\\chatapp\\login\\chat-app-c64df-firebase-adminsdk-fbsvc-4575a14d7a.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# Add data
doc_ref = db.collection("users@mail.com").document("alice@mail.com")
doc_ref.set({
    "data":[{
        "id": "m1755319133175",
        "senderId": "new@mail.com",
        "text": "All good, thanks!",
        "timestamp": datetime.now(),
},
{
        "id": "m1755319133175",
        "senderId": "new@mail.com",
        "text": "All good, thanks!",
        "timestamp": datetime.now(),
}]
})

# Read data
doc = doc_ref.get()
print(doc.to_dict())

# Update data
# doc_ref.update({"age": 26})

# Delete data
# doc_ref.delete()
