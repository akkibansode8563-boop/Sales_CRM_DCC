# DCC SalesForce - ProGuard Rules
# Keep TWA / Chrome Custom Tabs bridge
-keep class com.google.androidbrowserhelper.** { *; }
-keep class androidx.browser.** { *; }
-dontwarn com.google.androidbrowserhelper.**
