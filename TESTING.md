# 🚀 Quick Start Guide - Phase 1 Testing

## ✅ Setup Complete!

Your Sales Manager CRM is ready for testing. Here's what's running:

### 📡 API Server Status
- **URL:** http://localhost:3001
- **Status:** ✅ Running
- **Database:** JSON file (db.json) with 3 users

### 🌐 Frontend Files Created
- **Login:** `login.html`
- **Manager Dashboard:** `dashboard-manager.html`
- **Admin Dashboard:** `dashboard-admin.html`

---

## 🧪 How to Test Phase 1

### Option 1: Quick Test (Recommended)
**1. Open the login page in your browser:**
```
File Location: d:\6. Infotech 2025-2026\APP\APP BRAINSTORMING\sales-crm\login.html
```
- Right-click `login.html` → "Open with" → Your browser (Chrome/Edge/Firefox)
- OR drag and drop the file into your browser

**2. Try logging in with these test credentials:**

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `Admin@123` |
| Manager | `john_doe` | `Manager@123` |
| Manager | `jane_smith` | `Manager@123` |

**3. Verify the following:**
- ✅ Login form displays correctly with gradient design
- ✅ Error messages appear for incorrect credentials
- ✅ Success message shows on valid login
- ✅ Admin redirects to Admin Dashboard
- ✅ Managers redirect to Manager Dashboard
- ✅ Logout button works and returns to login
- ✅ "Remember Me" stores session in localStorage

---

## 🎯 Test Scenarios

### Scenario 1: Admin Login Flow
1. Open `login.html`
2. Enter: `admin` / `Admin@123`
3. Click "Sign In"
4. **Expected:** Redirects to Admin Dashboard showing "God Mode"
5. Click "Logout"
6. **Expected:** Returns to login page

### Scenario 2: Manager Login Flow
1. Open `login.html`
2. Enter: `john_doe` / `Manager@123`
3. Check "Remember Me"
4. Click "Sign In"
5. **Expected:** Redirects to Manager Dashboard
6. Close browser and reopen `login.html`
7. **Expected:** Auto-redirects to dashboard (session persists)

### Scenario 3: Invalid Credentials
1. Open `login.html`
2. Enter: `wrong` / `password`
3. Click "Sign In"
4. **Expected:** Red error message: "Invalid credentials"

### Scenario 4: Protected Route Access
1. Without logging in, manually open `dashboard-admin.html`
2. **Expected:** Auto-redirects to login page
3. Login as Manager (`john_doe`)
4. Try accessing `dashboard-admin.html`
5. **Expected:** Access denied → redirects to Manager dashboard

---

## 🔍 What to Look For

### ✅ Visual Design
- Modern gradient background (blue to teal)
- Clean white login card with shadow
- Google Fonts (Inter & Outfit) loaded
- Smooth animations on page load
- Responsive design on mobile

### ✅ Functionality
- Form validation (required fields)
- API communication with localhost:3001
- JWT token storage
- Role-based routing
- Session persistence

### ✅ Error Handling
- API connection errors shown
- Invalid credentials feedback
- Loading spinner during authentication

---

## 🛠️ Troubleshooting

### Issue: "Failed to connect to server"
**Solution:** Make sure the API server is running:
```bash
cd "d:\6. Infotech 2025-2026\APP\APP BRAINSTORMING\sales-crm\mcp-server"
node server-simple.js
```
You should see:
```
✅ Sales CRM API Server running on http://localhost:3001
```

### Issue: Login page doesn't load
**Solution:** Open directly from file system:
1. Navigate to folder in Windows Explorer
2. Right-click `login.html`
3. Open with Chrome/Edge

### Issue: Dashboard shows but looks broken
**Solution:** Check browser console (F12) for errors. Make sure internet connection is active (for Google Fonts).

---

## 📊 Phase 1 Checklist

Test each item and mark complete:

- [ ] Login page loads with proper styling
- [ ] Can login with admin credentials
- [ ] Can login with manager credentials
- [ ] Invalid credentials show error message
- [ ] Admin redirects to admin dashboard
- [ ] Manager redirects to manager dashboard
- [ ] Logout works correctly
- [ ] "Remember Me" persists session
- [ ] Protected routes block unauthenticated access
- [ ] Role-based access control works (Manager can't access Admin page)

---

## 🎉 Expected Results

After testing, you should see:
1. **Beautifully designed login UI** with gradient background
2. **Functional authentication** with API calls to localhost:3001
3. **Role-based dashboards** showing different content for Admin vs Manager
4. **Session management** with localStorage/sessionStorage
5. **Protected routes** that require authentication

---

## 📸 Screenshots to capture (for validation)

1. Login page initial view
2. Login page with error message
3. Login page with success message
4. Admin dashboard
5. Manager dashboard

---

## 📞 Next Steps After Testing

Once Phase 1 testing is complete, we'll proceed to:
- **Phase 2:** Build Manager Dashboard with visit tracking
- **Phase 3:** Implement Google Maps journey visualization
- **Phase 4:** Add daily target management
- **Phase 5:** Complete Admin "God Mode" features

---

**Ready to test? Open `login.html` in your browser now!** 🚀
