// src/services/axios.js
import axios from 'axios';
import { clearChatState, clearAllUserStorage } from '../utils/chatStateUtils'; // Import from utility file instead

// Get the QueryClient instance - we'll need to access it from the React Query context
let queryClientInstance = null;

// Function to set the QueryClient instance (called from AuthContext)
export const setQueryClient = (client) => {
  queryClientInstance = client;
};

// Determine base URL based on hostname
// const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isDevelopment = window.location.hostname === 'localhost' 
    || window.location.hostname === '127.0.0.1'
    // || window.location.hostname === '100.64.14.100';
    || window.location.hostname.startsWith('100.64')
    || window.location.hostname.startsWith('192.168')
    || window.location.hostname.startsWith('10.179');
    // ^^ Flexible check that will work ^^
    // ^^ even if your IP address changes in the future, ^^
    // ^^ as long as it starts with 100.64 ^^

    
const baseURL = isDevelopment 
    // ? 'http://localhost:8000/api' // Your local backend API base
    // : 'https://hangout-8prs.onrender.com/api'; // Fixed: Added /api path for production
    ? `http://${window.location.hostname}:8000/api` // Use dynamic hostname
    : 'https://hangout-8prs.onrender.com/api'; // Production URL

// ^^ Here you would run the django backend by running this command:
// python manage.py runserver 0.0.0.0:8000
// This command allows for you to be able to log into the same
// local network on your phone or other mobile devices.


const axiosInstance = axios.create({
  baseURL: baseURL,
  timeout: 300000, // Increased timeout to 300 seconds aka 5 minutes (300000ms)
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
});

// --- Token Refresh Logic --- //

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

axiosInstance.interceptors.request.use(
  config => {
    const accessToken = localStorage.getItem('accessToken');
    const explicitGuestMode = localStorage.getItem('guestMode') === 'true';
    
    // Treat users as guests if they don't have a valid access token OR if they're explicitly in guest mode
    const isGuestOrUnauthenticated = !accessToken || explicitGuestMode;
    
    // Debug logging (can be removed in production)
    // console.log('Axios interceptor:', { hasAccessToken: !!accessToken, explicitGuestMode, isGuestOrUnauthenticated, url: config.url });
    
    // Don't add token for public endpoints or guest/unauthenticated users
    const publicEndpoints = ['/token/', '/token/refresh/', '/users/register/', '/categories/'];
    const isPublicEndpoint = publicEndpoints.includes(config.url);
    
    // Check if this is an events read operation (GET requests to /events/ endpoints)
    const isEventsReadOperation = config.method?.toLowerCase() === 'get' && 
                                 (config.url?.startsWith('/events/') || config.url?.includes('/events/popular/'));
    
    // Check if this is an event-attendees read operation (GET requests to /event-attendees/ endpoints)
    const isAttendeesReadOperation = config.method?.toLowerCase() === 'get' && 
                                    config.url?.startsWith('/event-attendees/');
    
    // Check if this is a categories read operation (GET requests to /categories/ endpoints)
    const isCategoriesReadOperation = config.method?.toLowerCase() === 'get' && 
                                     config.url?.startsWith('/categories/');
    
    // Only add authorization header if:
    // 1. Have a valid access token AND not in guest mode
    // 2. Not a public endpoint
    // 3. Not a read operation on events, attendees, or categories (which should be public)
    if (accessToken && !isGuestOrUnauthenticated && !isPublicEndpoint && !isEventsReadOperation && !isAttendeesReadOperation && !isCategoriesReadOperation) {
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

axiosInstance.interceptors.response.use(
  response => {
    // Any status code within the range of 2xx cause this function to trigger
    return response;
  },
  async error => {
    const originalRequest = error.config;

    // Log detailed error information
    if (error.response) {
        console.error('Axios Response Error:', {
            status: error.response.status,
            data: error.response.data,
            headers: error.response.headers,
            url: originalRequest.url,
            method: originalRequest.method,
            requestData: originalRequest.data, // Log request payload if helpful
        });
    } else if (error.request) {
        console.error('Axios Request Error (No Response):', error.request);
    } else {
        console.error('Axios Error:', error.message);
    }

    // Handle 401 Unauthorized errors specifically for token refresh
    if (error.response?.status === 401 && originalRequest.url !== '/token/refresh/' && !originalRequest._retry) {
        
        const accessToken = localStorage.getItem('accessToken');
        const explicitGuestMode = localStorage.getItem('guestMode') === 'true';
        const isGuestOrUnauthenticated = !accessToken || explicitGuestMode;
        
        // For guest/unauthenticated users, don't attempt token refresh - just reject the error
        if (isGuestOrUnauthenticated) {
            console.log('Guest/unauthenticated user received 401 - this should not happen for public endpoints');
            console.log('Request details:', { url: originalRequest.url, method: originalRequest.method });
            return Promise.reject(error);
        }
        
        if (isRefreshing) {
            // If token is already being refreshed, queue the original request
            return new Promise(function(resolve, reject) {
                failedQueue.push({ resolve, reject });
            }).then(token => {
                originalRequest.headers['Authorization'] = 'Bearer ' + token;
                return axiosInstance(originalRequest); // Retry with new token
            }).catch(err => {
                return Promise.reject(err); // Propagate error if queue processing fails
            });
        }

        originalRequest._retry = true; // Mark request as retried
        isRefreshing = true;

        const refreshToken = localStorage.getItem('refreshToken');
        
        if (!refreshToken) {
            console.error('No refresh token available.');
            isRefreshing = false;
            
            // Complete cleanup - clear everything
            clearAllUserStorage();
            
            // Dispatch custom event to notify AuthContext of localStorage change
            window.dispatchEvent(new CustomEvent('localStorageChange', {
                detail: { key: 'accessToken', newValue: null }
            }));
            
            // Clear React Query cache on authentication failure
            if (queryClientInstance) {
                queryClientInstance.clear();
            }
            
            // Don't use window.location.href - let ProtectedRoute and AuthContext handle navigation
            return Promise.reject(error);
        }

        try {
            console.log('Attempting token refresh...');
            const refreshResponse = await axios.post(`${baseURL}/token/refresh/`, {
                refresh: refreshToken
            }, {
                 headers: { 'Content-Type': 'application/json' } // Ensure correct headers for refresh request
            });

            const newAccessToken = refreshResponse.data.access;
            if (!newAccessToken) {
                 throw new Error('Access token not found in refresh response');
            }
            
            console.log('Token refresh successful.');
            localStorage.setItem('accessToken', newAccessToken);
            
            // Update the default header for subsequent requests
            axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
            // Update the header of the original failed request
            originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
            
            processQueue(null, newAccessToken); // Process queued requests with the new token
            
            isRefreshing = false;
            return axiosInstance(originalRequest); // Retry the original request

        } catch (refreshError) {
            console.error('Token refresh failed:', refreshError.response ? refreshError.response.data : refreshError.message);
            processQueue(refreshError, null); // Reject queued requests
            isRefreshing = false;
            
            // Complete cleanup - clear everything
            clearAllUserStorage();
            
            // Dispatch custom event to notify AuthContext of localStorage change
            window.dispatchEvent(new CustomEvent('localStorageChange', {
                detail: { key: 'accessToken', newValue: null }
            }));
            
            // Clear React Query cache on authentication failure
            if (queryClientInstance) {
                queryClientInstance.clear();
            }
            
            // Don't use window.location.href - let ProtectedRoute and AuthContext handle navigation
            return Promise.reject(refreshError);
        }
    }

    // For errors other than 401 or if retry failed, reject the promise
    return Promise.reject(error);
  }
);

export default axiosInstance;