import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { useNavigate, useLocation } from 'react-router-dom';
import axiosInstance from '../../services/axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './EventCreate.css';
import mainCategoriesData from '../../data/mainCategories.json'; // Import the new JSON file

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function LocationMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return position === null ? null : (
    <Marker position={position} />
  );
}

export default function EventCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  // Use hardcoded categories with correct IDs
  const [mainCategories, setMainCategories] = useState(mainCategoriesData); 
  const [error, setError] = useState(''); 
  const [loading, setLoading] = useState(false); 
  const [position, setPosition] = useState({ lat: 33.9937, lng: -81.0299 });
  const [geocoding, setGeocoding] = useState(false); // Add loading state for geocoding
  const [searchingField, setSearchingField] = useState(null); // Track which field is being searched
  const [validatedLocations, setValidatedLocations] = useState({
    location_name: false,
    event_address: false
  }); // Track which locations have been validated
  
  // Parse query parameters
  useEffect(() => {
    // Scroll to the top of the page when component mounts or query params change
    window.scrollTo(0, 0);
    
    const queryParams = new URLSearchParams(location.search);
    const categoryId = queryParams.get('categoryId');
    const subcategoryId = queryParams.get('subcategoryId');
    const categoryName = queryParams.get('categoryName');
    const icon = queryParams.get('icon');
    
    if (categoryId && categoryName) {
      // Pre-fill form with query parameters and append "Event" to the name
      setFormData(prev => ({
        ...prev,
        name: icon ? `${icon} ${categoryName} Event` : `${categoryName} Event`,
        category: categoryId
      }));
    }
  }, [location.search]);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location_name: '',
    event_address: '',
    start_time: '',
    end_time: '',
    is_recurring: false,
    price: 0,
    max_attendees: '',
    category: '', // Keep category state
    image: null
  });

  // Validate location function
  const validateLocation = async (address, fieldName) => {
    if (!address.trim()) {
      setValidatedLocations(prev => ({ ...prev, [fieldName]: false }));
      return false;
    }
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'HangoutWebApp/1.0'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        setValidatedLocations(prev => ({ ...prev, [fieldName]: true }));
        return true;
      } else {
        setValidatedLocations(prev => ({ ...prev, [fieldName]: false }));
        return false;
      }
    } catch (err) {
      console.error('Location validation error:', err);
      setValidatedLocations(prev => ({ ...prev, [fieldName]: false }));
      return false;
    }
  };

  // Add geocoding function
  const geocodeAddress = async (address) => {
    if (!address.trim()) return;
    
    setGeocoding(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'HangoutWebApp/1.0' // Add user agent for API courtesy
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = data[0];
        const newPosition = {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon)
        };
        setPosition(newPosition);
        
        // Clear any previous errors
        setError('');
        
        // Mark the field as validated
        setValidatedLocations(prev => ({ ...prev, [searchingField]: true }));
      } else {
        setError('Address not found. Please try a different search term or be more specific.');
        setTimeout(() => setError(''), 4000); // Clear error after 4 seconds
        setValidatedLocations(prev => ({ ...prev, [searchingField]: false }));
      }
    } catch (err) {
      console.error('Geocoding error:', err);
      setError('Failed to search for address. Please check your internet connection and try again.');
      setTimeout(() => setError(''), 4000);
      setValidatedLocations(prev => ({ ...prev, [searchingField]: false }));
    } finally {
      setGeocoding(false);
      setSearchingField(null); // Reset the searching field when done
    }
  };

  // Add handler for Enter key press on both Location Name and Event Address fields
  const handleAddressKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Use the value from whichever field triggered the event
      const searchValue = e.target.value;
      if (searchValue.trim()) {
        // Set which field is being searched based on the field name
        setSearchingField(e.target.name);
        geocodeAddress(searchValue);
      }
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : 
              type === 'file' ? files[0] : 
              type === 'number' ? parseFloat(value) : 
              value
    }));

    // Reset validation status when user changes location fields
    if (name === 'location_name' || name === 'event_address') {
      setValidatedLocations(prev => ({ ...prev, [name]: false }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate locations before submission
    const locationNameValid = await validateLocation(formData.location_name, 'location_name');
    const eventAddressValid = await validateLocation(formData.event_address, 'event_address');

    if (!locationNameValid || !eventAddressValid) {
      let errorMessage = 'Please provide valid locations:\n';
      if (!locationNameValid) {
        errorMessage += '• Location Name: Please enter a valid location that can be found on the map\n';
      }
      if (!eventAddressValid) {
        errorMessage += '• Event Address: Please enter a valid address that can be found on the map\n';
      }
      setError(errorMessage);
      setLoading(false);
      return;
    }

    try {
      const eventData = new FormData();
      
      // Add basic form fields with proper type conversion
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null && formData[key] !== '') {
          switch(key) {
            case 'price':
              eventData.append(key, parseFloat(formData[key]).toFixed(2));
              break;
            case 'max_attendees':
              eventData.append(key, parseInt(formData[key]));
              break;
            case 'is_recurring':
              eventData.append(key, formData[key] ? 'true' : 'false');
              break;
            case 'start_time':
            case 'end_time':
              // Ensure proper ISO format with timezone
              const date = new Date(formData[key]);
              eventData.append(key, date.toISOString());
              break;
            default:
              eventData.append(key, formData[key]);
          }
        }
      });
      
      // Use main category directly (no subcategory fallback)
      eventData.set('category', formData.category); 
      
      // Add coordinates (only once)
      if (!eventData.has('latitude')) {
        eventData.append('latitude', position.lat.toFixed(6));
      }
      if (!eventData.has('longitude')) {
        eventData.append('longitude', position.lng.toFixed(6));
      }

      // Log the final form data for debugging
      const formDataObj = {};
      eventData.forEach((value, key) => {
        formDataObj[key] = value;
      });
      console.log('Submitting data:', formDataObj);

      const response = await axiosInstance.post('/events/', eventData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      navigate(`/events/${response.data.id}`);
    } catch (err) {
      console.error('Failed to create event:', err);
      
      // Handle specific location validation errors from backend
      if (err.response?.data?.error) {
        const errorData = err.response.data.error;
        let errorMessage = '';
        
        if (errorData.location_name) {
          errorMessage += `Location Name: ${errorData.location_name[0]}\n`;
        }
        if (errorData.event_address) {
          errorMessage += `Event Address: ${errorData.event_address[0]}\n`;
        }
        if (errorData.non_field_errors) {
          errorMessage += errorData.non_field_errors.join('\n');
        }
        
        // If no specific location errors, show general error
        if (!errorMessage) {
          errorMessage = err.response?.data?.message || 
                        'Failed to create event. Please check all fields and try again.';
        }
        
        setError(errorMessage);
      } else {
        const errorMessage = err.response?.data?.message || 
                            'Failed to create event. Please try again.';
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    
    <div className="event-create-container">
      <div className="event-create-card">
        <div className="profile-header-actions">
          <nav
            className="back-button"
            onClick={() => navigate('/')}
          >
            Back Home
          </nav>
        </div>

        <h2 className="event-create-title">Create New Event</h2>

        {error && (
          <div className="error-message" style={{ whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="name-recurring-group">
            <div className="form-group">
              <label className="form-label" htmlFor="name">Event Name</label>
              <input
                className="form-input"
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="checkbox-group" onClick={(e) => {
              // Prevent double-toggling when clicking directly on checkbox or label
              if (e.target.type !== 'checkbox' && e.target.tagName !== 'LABEL') {
                setFormData(prev => ({ ...prev, is_recurring: !prev.is_recurring }));
              }
            }}>
              <div>
                <input
                  className="checkbox-input"
                  type="checkbox"
                  id="is_recurring"
                  name="is_recurring"
                  checked={formData.is_recurring}
                  onChange={handleChange}
                />
                <label className="form-label" htmlFor="is_recurring" style={{ display: 'inline', marginLeft: '8px' }}>
                  This is a recurring event
                </label>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="description">Description</label>
            <textarea
              className="form-input form-textarea"
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              required
            />
          </div>

          {/* Main Category Selection */}
          <div className="form-group">
            <label className="form-label" htmlFor="category">Life Category</label>
            <select
              className="form-input form-select"
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
            >
              <option value="">Select A Life Category</option>
              {mainCategories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.icon} {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="datetime-group">
            <div className="form-group">
              <label className="form-label" htmlFor="start_time">Start Time</label>
              <input
                className="form-input"
                type="datetime-local"
                id="start_time"
                name="start_time"
                value={formData.start_time}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="end_time">End Time</label>
              <input
                className="form-input"
                type="datetime-local"
                id="end_time"
                name="end_time"
                value={formData.end_time}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <p className="input-help">
            💡 Type an Address or Location Name and press Enter to automatically locate it on the map
          </p>

          <div className="location-group">
            <div className="form-group">
              <label className="form-label" htmlFor="location_name">Location Name</label>
              <input
                className={`form-input ${validatedLocations.location_name ? 'validated' : ''}`}
                type="text"
                id="location_name"
                name="location_name"
                value={formData.location_name}
                onChange={handleChange}
                onKeyDown={handleAddressKeyPress}
                placeholder={geocoding && searchingField === 'location_name' ? "Searching..." : "Enter Location Name"}
                disabled={geocoding && searchingField === 'location_name'}
                required
              />
              {geocoding && searchingField === 'location_name' && (
                <div className="geocoding-indicator location-geocoding">
                  <span>🔍 Searching for location...</span>
                </div>
              )}
              {validatedLocations.location_name && (
                <div className="validation-success">
                  <span>✅ Location validated</span>
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="event_address">Event Address</label>
              <input
                className={`form-input ${validatedLocations.event_address ? 'validated' : ''}`}
                type="text"
                id="event_address"
                name="event_address"
                value={formData.event_address}
                onChange={handleChange}
                onKeyDown={handleAddressKeyPress}
                placeholder={geocoding && searchingField === 'event_address' ? "Searching..." : "Enter Address"}
                disabled={geocoding && searchingField === 'event_address'}
                required
              />
              {geocoding && searchingField === 'event_address' && (
                <div className="geocoding-indicator address-geocoding">
                  <span>🔍 Searching for address...</span>
                </div>
              )}
              {validatedLocations.event_address && (
                <div className="validation-success">
                  <span>✅ Address validated</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">Select Location on Map</label>
            <div className="map-container">
              <MapContainer
                center={position}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
                key={`${position.lat}-${position.lng}`}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <LocationMarker position={position} setPosition={setPosition} />
              </MapContainer>
            </div>
          </div>

          <div className="price-attendees-group">
            <div className="form-group">
              <label className="form-label" htmlFor="price">Price ($)</label>
              <input
                className="form-input"
                type="number"
                id="price"
                name="price"
                value={formData.price}
                onChange={handleChange}
                min="0"
                step="0.01"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="max_attendees">Maximum Attendees</label>
              <input
                className="form-input"
                type="number"
                id="max_attendees"
                name="max_attendees"
                value={formData.max_attendees}
                onChange={handleChange}
                min="1"
              />
            </div>
          </div>

          <div className="file-input-group">
            <label className="form-label form-label-large" htmlFor="image">Event Image</label>
            <div 
              className="file-input-container"
              onClick={() => document.getElementById('image').click()}
              style={{cursor: 'pointer'}}
            >
              <div className="file-input-placeholder" style={{cursor: 'pointer'}}>
                <svg className="upload-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{cursor: 'pointer'}}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                {formData.image ? formData.image.name : "Click to select a file"}
              </div>
              <input
                className="file-input"
                type="file"
                id="image"
                name="image"
                onChange={handleChange}
                accept="image/*"
                style={{cursor: 'pointer'}}
              />
            </div>
          </div>

          <button
            className="submit-button"
            type="submit"
            disabled={loading}
          >
            {loading ? "Creating Event..." : "Create Event"}
          </button>
        </form>
      </div>
    </div>
  );
}