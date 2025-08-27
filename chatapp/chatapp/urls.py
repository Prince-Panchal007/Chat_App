"""
URL configuration for chatapp project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from login import views
from firebase import views as v

urlpatterns = [
    path('admin/', admin.site.urls),
    # path('',views.home,name='home'),
    path('signup/', views.signup, name='signup'),
    path('login/', views.login, name='login'),
    path('store/', v.add_message, name='store'),
    path('fetch_data/', v.fetch_data, name='fetch_data'),
    path('otp/', views.send_otp, name='otp'),
    path('check_otp/', views.check_otp, name='check_otp'),
    path('bot/', views.bot, name='bot'),
    path("suggest/", v.suggest_reply, name="get_suggestions"),
]
