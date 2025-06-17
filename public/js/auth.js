// Authentication Module
const Auth = {
    // Check if user is logged in
    isLoggedIn() {
        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) return false;
            
            const user = JSON.parse(userStr);
            return user && user.username && user.userId;
        } catch (error) {
            console.error('Error checking login status:', error);
            // Clear corrupted data
            localStorage.removeItem('user');
            localStorage.removeItem('token');
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
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', user.userId); // Simple token for now
    },

    // Logout
    logout() {
        console.log('Logging out user...');
        localStorage.removeItem('user');
        localStorage.removeItem('token');
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