// Authentication Module
const Auth = {
    // Check if user is logged in
    isLoggedIn() {
        return localStorage.getItem('user') !== null;
    },

    // Get current user
    getCurrentUser() {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    },

    // Save user to localStorage
    saveUser(user) {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', user.userId); // Simple token for now
    },

    // Logout
    logout() {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.href = '/';
    },

    // Login function
    async login(username, password) {
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            
            if (response.ok && data.success) {
                this.saveUser(data.user);
                return { success: true, user: data.user };
            } else {
                return { success: false, error: data.error || 'Login failed' };
            }
        } catch (error) {
            return { success: false, error: 'Network error' };
        }
    },

    // Register function
    async register(username, displayName, password) {
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, displayName, password })
            });

            const data = await response.json();
            
            if (response.ok && data.success) {
                this.saveUser(data.user);
                return { success: true, user: data.user };
            } else {
                return { success: false, error: data.error || 'Registration failed' };
            }
        } catch (error) {
            return { success: false, error: 'Network error' };
        }
    }
};

// Auto-redirect if not logged in (except on login page)
document.addEventListener('DOMContentLoaded', () => {
    const isAuthPage = window.location.pathname === '/' || 
                      window.location.pathname === '/index.html' ||
                      window.location.pathname === '/login' ||
                      window.location.pathname === '/register';
    
    if (!Auth.isLoggedIn() && !isAuthPage) {
        window.location.href = '/';
    }
});