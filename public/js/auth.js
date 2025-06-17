// Authentication Module
const Auth = {
    // Check if user is logged in
    isLoggedIn() {
        try {
            const userStr = localStorage.getItem('user');
            const loginTime = localStorage.getItem('loginTime');
            
            if (!userStr || !loginTime) return false;
            
            // Check if login is older than 24 hours
            const loginTimestamp = parseInt(loginTime);
            const now = Date.now();
            const twentyFourHours = 24 * 60 * 60 * 1000;
            
            if (now - loginTimestamp > twentyFourHours) {
                console.log('Session expired (24+ hours old), clearing login data');
                this.logout();
                return false;
            }
            
            const user = JSON.parse(userStr);
            const isValid = user && user.username && user.userId;
            
            if (!isValid) {
                console.log('Invalid user data found, clearing');
                this.logout();
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('Error checking login status:', error);
            // Clear corrupted data
            this.logout();
            return false;
        }
    },

    // Get current user
    getCurrentUser() {
        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) return null;
            
            const user = JSON.parse(userStr);
            if (user && user.username && user.userId) {
                return user;
            } else {
                // Invalid user data, clear it
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                return null;
            }
        } catch (error) {
            console.error('Error getting current user:', error);
            // Clear corrupted data
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            return null;
        }
    },

    // Save user to localStorage
    saveUser(user) {
        console.log('Saving user to localStorage:', user.username);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', user.userId);
        localStorage.setItem('loginTime', Date.now().toString());
    },

    // Logout
    logout() {
        console.log('Logging out user...');
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('loginTime');
        // Use simple redirect to avoid complex logout parameter handling
        window.location.href = '/';
    },

    // Login function
    async login(username, password) {
        try {
            console.log('Auth.login called with:', username);
            
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            console.log('Login response:', data);
            
            if (response.ok && data.success) {
                console.log('Login successful, saving user:', data.user);
                this.saveUser(data.user);
                return { success: true, user: data.user };
            } else {
                console.log('Login failed:', data.error);
                // Clear any existing session data on failed login
                this.logout();
                return { success: false, error: data.error || 'Login failed' };
            }
        } catch (error) {
            console.log('Login network error:', error);
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