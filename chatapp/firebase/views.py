from django.shortcuts import render
from django.http import JsonResponse
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore
from urllib.parse import unquote
from django.views.decorators.csrf import csrf_exempt
import json
from google.cloud.firestore_v1 import ArrayUnion
import requests
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.neighbors import NearestNeighbors




cred = credentials.Certificate("firebase.json")

# Initialize only if not already initialized
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()

@csrf_exempt
def add_message(request):
    if request.method == "POST":
        try:
            body = json.loads(request.body)
            selected = body.get("selected")
            message = body.get("messages")

            email = request.COOKIES.get("email")
            if not email:
                return JsonResponse({"success": False, "error": "Email cookie not found"})
            email = unquote(str(email))

            doc_ref = db.collection(email).document(selected)

            # First check if document exists
            doc = doc_ref.get()
            if doc.exists:
                # Append using ArrayUnion
                doc_ref.update({"data": ArrayUnion([message])})
            else:
                # Create new document with first message
                doc_ref.set({"data": [message]})

            # Fetch updated doc
            doc = doc_ref.get()
            return JsonResponse({"success": True, "document": doc.to_dict()})

        except Exception as e:
            print("Error:", e)
            return JsonResponse({"success": False, "error": str(e)})


        
@csrf_exempt
def fetch_data(request):
    if request.method == "POST":
        try:
            email = request.COOKIES.get("email")
            if not email:
                return JsonResponse({"success": False, "error": "Email cookie not found"})
            email = unquote(str(email))
            body = json.loads(request.body)
            selected = body.get("selected")
            if not selected:
                return JsonResponse({"success": False, "error": "Selected contact not provided"})
            doc_ref = db.collection(email).document(selected)
            doc = doc_ref.get()
            if not doc.exists:
                return JsonResponse({"success": False, "error": "No chat found with this contact"})
            return JsonResponse({"success": True, "data": doc.to_dict()})
        except Exception as e:
            print("Error:", e)
            return JsonResponse({"success": False, "error": str(e)})



df = pd.read_csv(r"chats.csv")

# Load embeddings model
model = SentenceTransformer("all-MiniLM-L6-v2")

# Encode input sentences
X = model.encode(df["input"], convert_to_tensor=False)

# Fit NearestNeighbors
knn = NearestNeighbors(n_neighbors=5, metric="cosine")
knn.fit(X)

def get_replies(user_input, top_k=5):
    vec = model.encode([user_input], convert_to_tensor=False)
    distances, indices = knn.kneighbors(vec.reshape(1, -1), n_neighbors=top_k)
    results = [df["reply"].iloc[idx] for idx in indices[0]]
    return results


@csrf_exempt
def suggest_reply(request):
    if request.method == "POST":
        try:
            body = json.loads(request.body)
            user_input = body.get("message")
            print('=====================================================================')
            print("User Input:", user_input)
            print('=====================================================================')
            if not user_input:
                return JsonResponse({"error": "No input provided"}, status=400)

            suggestions = get_replies(user_input, top_k=5)
            return JsonResponse({"input": user_input, "suggestions": suggestions}, safe=False)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "POST required"}, status=405)

