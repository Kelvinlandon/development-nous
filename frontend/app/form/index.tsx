import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import SignatureCanvas from 'react-native-signature-canvas';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
  process.env.EXPO_PUBLIC_BACKEND_URL || 
  'https://site-report-app-4.preview.emergentagent.com';

const SAFETY_CHECKLIST_QUESTIONS = [
  'Is an Accident/Incident/Hazard Report required?',
  'Are you wearing correct PPE (hats, boots, high-vis)?',
  'Is there signage displayed and is it legible?',
  'Is there safety noticeboard to observe?',
  'Is the site clear and safe with adequate access?',
  'Is there access to first aid on site?',
  'Are you required to use electrical equipment?',
  'Will you come into contact with any chemicals?',
  'Are there facilities to wash hands/sanitise?',
  'Is your work vehicle parked safely?',
];

const SITE_TYPE_OPTIONS = [
  'Greenfields Residential',
  'Greenfields Industrial',
  'Residential',
  'Industrial',
  'Farmland',
  'Subdivision',
  'Commercial',
];

const VISIT_PURPOSE_OPTIONS = [
  'Client Meeting',
  'Contractor Meeting',
  'Surveying',
  'Setout',
  'Construction monitoring inspection',
  'Building Consent requirement inspection',
  'Resource Consent inspection',
];

interface ChecklistItem {
  question: string;
  answer: string | null;
  notes: string;
}

interface SitePhoto {
  base64_data: string;
  caption: string;
  timestamp?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
}

interface FormData {
  // Header
  staff_members: string;
  date: string;
  job_no_name: string;
  job_address: string;
  job_address_lat: number | null;
  job_address_lng: number | null;
  departure_office: string;
  estimated_km: number | null;
  estimated_travel_minutes: number | null;
  time_on_site_minutes: number | null;
  total_project_hours: number | null;
  purpose_of_visit: string[];
  site_arrival_time: string;
  site_departure_time: string;
  site_description: string;
  weather_conditions: string;
  contractor_responsible: string;
  // Hazards
  risks_hazards_incidents: string;
  toolbox_talk_required: boolean;
  toolbox_talk_notes: string;
  // Checklist
  checklist_comments: string;
  safety_checklist: ChecklistItem[];
  electrical_equipment_list: string;
  // Building Consent Inspection
  building_consent_inspection: boolean;
  inspection_type: string;
  inspection_notes: string;
  inspection_result: '' | 'approved' | 'pending' | 'reinspection';
  evidence_received: boolean;
  evidence_date: string;
  evidence_signature: string;
  evidence_signature_type: 'drawn' | 'typed';
  // Timber Pile fields
  timber_bearing_capacity: string;
  timber_pile_layout_as_per_plan: string;
  timber_hole_diameter: string;
  timber_hole_depth: string;
  timber_anchor_piles_as_per_plan: string;
  timber_bearers_as_per_documentation: string;
  // Cupolex Slab fields
  cupolex_hardware_as_per_docs: string;
  cupolex_reentrant_corner_steel: string;
  cupolex_slab_mesh_approved: string;
  cupolex_slab_mesh_type: string;
  cupolex_edge_beam_approved: string;
  cupolex_edge_beam_type: string;
  cupolex_penetration_detailing_correct: string;
  cupolex_shower_step_down_correct: string;
  cupolex_concrete_strength: string;
  cupolex_dramix_fibre_required: string;
  // Photos
  site_photos: SitePhoto[];
  // Declaration
  staff_print_name: string;
  signature_data: string;
  signature_type: 'drawn' | 'typed';
  declaration_date: string;
}

export default function FormScreen() {
  const router = useRouter();
  const signatureRef = useRef<SignatureCanvas>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [editingCaptionIndex, setEditingCaptionIndex] = useState<number | null>(null);
  
  // Time picker states
  const [showArrivalTimePicker, setShowArrivalTimePicker] = useState(false);
  const [showDepartureTimePicker, setShowDepartureTimePicker] = useState(false);
  const [arrivalTime, setArrivalTime] = useState<Date | null>(new Date());
  const [departureTime, setDepartureTime] = useState<Date | null>(new Date(Date.now() + 30 * 60 * 1000));
  
  // Date picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Weather states
  const [fetchingWeather, setFetchingWeather] = useState(false);
  
  // Staff and Jobs lists
  const [staffList, setStaffList] = useState<Array<{id: string, name: string}>>([]);
  const [jobsList, setJobsList] = useState<Array<{id: string, job_number: string, job_name: string, job_address?: string}>>([]);
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [showSiteTypePicker, setShowSiteTypePicker] = useState(false);
  const [addressValidated, setAddressValidated] = useState(false);
  const [validatingAddress, setValidatingAddress] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{display_name: string, latitude: number, longitude: number}>>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newJobNumber, setNewJobNumber] = useState('');
  const [newJobName, setNewJobName] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  
  // Dynamic inspection items
  const [inspectionTypes, setInspectionTypes] = useState<string[]>([]);
  const [inspectionItems, setInspectionItems] = useState<Record<string, Array<{question: string, answer_type: string, options: string}>>>({});
  const [inspectionResponses, setInspectionResponses] = useState<Record<string, {answer: string, detail: string}>>({});
  
  // Distance estimation
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [distanceMessage, setDistanceMessage] = useState('');
  
  const today = new Date();
  const todayString = today.toISOString().split('T')[0];
  
  // Fetch staff and jobs on mount
  useEffect(() => {
    fetchStaffAndJobs();
    fetchInspectionItems();
  }, []);

  // Auto-fill declaration name when reaching Declaration step
  useEffect(() => {
    if (currentStep === 5 && formData.staff_members) {
      setFormData(prev => ({
        ...prev,
        staff_print_name: prev.staff_members,
        declaration_date: prev.declaration_date || new Date().toISOString().split('T')[0],
      }));
    }
  }, [currentStep]);


  const fetchStaffAndJobs = async () => {
    try {
      const [staffRes, jobsRes] = await Promise.all([
        axios.get(`${API_URL}/api/staff`),
        axios.get(`${API_URL}/api/jobs`)
      ]);
      setStaffList(staffRes.data);
      setJobsList(jobsRes.data);
    } catch (error) {
      console.error('Error fetching staff/jobs:', error);
    }
  };

  const fetchInspectionItems = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/inspection-items`);
      setInspectionTypes(response.data.types || []);
      setInspectionItems(response.data.items || {});
    } catch (error) {
      console.error('Error fetching inspection items:', error);
      // Will use defaults rendered by backend if fetch fails
    }
  };

  const estimateDistance = async (office: string, jobAddress: string) => {
    if (!office || !jobAddress) return;
    setCalculatingDistance(true);
    setDistanceMessage('Calculating...');
    try {
      const response = await axios.get(`${API_URL}/api/estimate-distance`, {
        params: { office, job_address: jobAddress }
      });
      if (response.data.success) {
        const travelMin = response.data.duration_minutes || null;
        setFormData(prev => {
          const updated = { ...prev, estimated_km: response.data.km, estimated_travel_minutes: travelMin };
          return recalcProjectTime(updated);
        });
        setDistanceMessage(response.data.message);
      } else {
        setDistanceMessage(response.data.message || 'Could not estimate distance');
        setFormData(prev => ({ ...prev, estimated_km: null, estimated_travel_minutes: null }));
      }
    } catch (error) {
      console.error('Distance estimation error:', error);
      setDistanceMessage('Failed to estimate distance');
      setFormData(prev => ({ ...prev, estimated_km: null, estimated_travel_minutes: null }));
    } finally {
      setCalculatingDistance(false);
    }
  };

  const calcOnSiteMinutes = (arrival: string, departure: string): number | null => {
    if (!arrival || !departure) return null;
    const [aH, aM] = arrival.split(':').map(Number);
    const [dH, dM] = departure.split(':').map(Number);
    if (isNaN(aH) || isNaN(aM) || isNaN(dH) || isNaN(dM)) return null;
    const diff = (dH * 60 + dM) - (aH * 60 + aM);
    return diff > 0 ? diff : null;
  };

  const recalcProjectTime = (data: FormData): FormData => {
    const onSite = calcOnSiteMinutes(data.site_arrival_time, data.site_departure_time);
    const travelReturn = data.estimated_travel_minutes ? data.estimated_travel_minutes * 2 : 0;
    const totalMin = (onSite || 0) + travelReturn;
    return {
      ...data,
      time_on_site_minutes: onSite,
      total_project_hours: totalMin > 0 ? Math.round(totalMin / 6) / 10 : null, // round to 1 decimal
    };
  };


  const updateInspectionResponse = (question: string, answer: string, detail?: string) => {
    setInspectionResponses(prev => ({
      ...prev,
      [question]: {
        answer: answer,
        detail: detail !== undefined ? detail : (prev[question]?.detail || ''),
      }
    }));
  };

  const updateInspectionDetail = (question: string, detail: string) => {
    setInspectionResponses(prev => ({
      ...prev,
      [question]: {
        answer: prev[question]?.answer || '',
        detail: detail,
      }
    }));
  };

  const addNewStaff = async () => {
    if (!newStaffName.trim()) return;
    try {
      const response = await axios.post(`${API_URL}/api/staff`, { name: newStaffName.trim() });
      setStaffList(prev => [...prev, response.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewStaffName('');
      // Auto-select the new staff
      toggleStaffSelection(response.data.name);
    } catch (error) {
      Alert.alert('Error', 'Failed to add staff member');
    }
  };

  const addNewJob = async () => {
    if (!newJobNumber.trim() || !newJobName.trim()) return;
    try {
      const response = await axios.post(`${API_URL}/api/jobs`, { 
        job_number: newJobNumber.trim(),
        job_name: newJobName.trim()
      });
      setJobsList(prev => [...prev, response.data].sort((a, b) => a.job_number.localeCompare(b.job_number)));
      // Auto-select the new job
      const jobDisplay = `${response.data.job_number} - ${response.data.job_name}`;
      updateField('job_no_name', jobDisplay);
      setNewJobNumber('');
      setNewJobName('');
      setShowJobPicker(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to add job');
    }
  };

  const toggleStaffSelection = (staffName: string) => {
    setSelectedStaff(prev => {
      const newSelection = prev.includes(staffName)
        ? prev.filter(s => s !== staffName)
        : [...prev, staffName];
      updateField('staff_members', newSelection.join(', '));
      return newSelection;
    });
  };

  const validateAddress = async (address: string) => {
    if (!address || address.trim().length < 3) return;
    setValidatingAddress(true);
    try {
      const response = await axios.get(`${API_URL}/api/geocode`, { params: { address: address.trim() } });
      if (response.data.valid && response.data.results.length > 0) {
        setAddressSuggestions(response.data.results);
        setShowAddressSuggestions(true);
      } else {
        Alert.alert('Address Not Found', 'Could not find a matching address. You can still use a custom address.');
        setAddressSuggestions([]);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setValidatingAddress(false);
    }
  };

  const selectAddressSuggestion = (suggestion: {display_name: string, latitude: number, longitude: number}) => {
    setFormData(prev => ({
      ...prev,
      job_address: suggestion.display_name,
      job_address_lat: suggestion.latitude,
      job_address_lng: suggestion.longitude,
    }));
    setAddressValidated(true);
    setShowAddressSuggestions(false);
    // Auto-calculate distance if office is already selected
    if (formData.departure_office) {
      estimateDistance(formData.departure_office, suggestion.display_name);
    }
  };

  const openInMaps = () => {
    if (formData.job_address_lat && formData.job_address_lng) {
      const url = Platform.select({
        ios: `maps:0,0?q=${formData.job_address_lat},${formData.job_address_lng}`,
        android: `geo:${formData.job_address_lat},${formData.job_address_lng}?q=${formData.job_address_lat},${formData.job_address_lng}`,
        default: `https://www.openstreetmap.org/?mlat=${formData.job_address_lat}&mlon=${formData.job_address_lng}#map=16/${formData.job_address_lat}/${formData.job_address_lng}`,
      });
      if (url) Linking.openURL(url);
    }
  };
  
  const [formData, setFormData] = useState<FormData>({
    staff_members: '',
    date: todayString,
    job_no_name: '',
    job_address: '',
    job_address_lat: null,
    job_address_lng: null,
    departure_office: '',
    estimated_km: null,
    estimated_travel_minutes: null,
    time_on_site_minutes: 30,
    total_project_hours: null,
    purpose_of_visit: [],
    site_arrival_time: (() => {
      const now = new Date();
      return now.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: false });
    })(),
    site_departure_time: (() => {
      const later = new Date(Date.now() + 30 * 60 * 1000);
      return later.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: false });
    })(),
    site_description: '',
    weather_conditions: '',
    contractor_responsible: '',
    risks_hazards_incidents: '',
    toolbox_talk_required: false,
    toolbox_talk_notes: '',
    checklist_comments: '',
    safety_checklist: SAFETY_CHECKLIST_QUESTIONS.map(q => ({
      question: q,
      answer: null,
      notes: '',
    })),
    electrical_equipment_list: '',
    building_consent_inspection: false,
    inspection_type: '',
    inspection_notes: '',
    inspection_result: '' as '' | 'approved' | 'pending' | 'reinspection',
    evidence_received: false,
    evidence_date: '',
    evidence_signature: '',
    evidence_signature_type: 'typed' as 'drawn' | 'typed',
    timber_bearing_capacity: '',
    timber_pile_layout_as_per_plan: '',
    timber_hole_diameter: '',
    timber_hole_depth: '',
    timber_anchor_piles_as_per_plan: '',
    timber_bearers_as_per_documentation: '',
    cupolex_hardware_as_per_docs: '',
    cupolex_reentrant_corner_steel: '',
    cupolex_slab_mesh_approved: '',
    cupolex_slab_mesh_type: '',
    cupolex_edge_beam_approved: '',
    cupolex_edge_beam_type: '',
    cupolex_penetration_detailing_correct: '',
    cupolex_shower_step_down_correct: '',
    cupolex_concrete_strength: '',
    cupolex_dramix_fibre_required: '',
    site_photos: [],
    staff_print_name: '',
    signature_data: '',
    signature_type: 'typed',
    declaration_date: todayString,
  });

  const steps = ['Site Info', 'Hazards', 'Safety', 'Inspection', 'Photos', 'Declare'];

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateChecklistItem = (index: number, field: 'answer' | 'notes', value: string) => {
    setFormData(prev => {
      const newChecklist = [...prev.safety_checklist];
      newChecklist[index] = { ...newChecklist[index], [field]: value };
      return { ...prev, safety_checklist: newChecklist };
    });
  };

  const handleSignature = (signature: string) => {
    updateField('signature_data', signature);
    updateField('signature_type', 'drawn');
    setShowSignaturePad(false);
  };

  const clearSignature = () => {
    signatureRef.current?.clearSignature();
  };

  // Time picker functions
  const formatTimeForDisplay = (date: Date | null): string => {
    if (!date) return '';
    return date.toLocaleTimeString('en-NZ', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatTimeForStorage = (date: Date | null): string => {
    if (!date) return '';
    return date.toLocaleTimeString('en-NZ', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const handleArrivalTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowArrivalTimePicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      setArrivalTime(selectedDate);
      const timeStr = formatTimeForStorage(selectedDate);
      setFormData(prev => recalcProjectTime({ ...prev, site_arrival_time: timeStr }));
    }
    if (Platform.OS === 'ios' && event.type === 'dismissed') {
      setShowArrivalTimePicker(false);
    }
  };

  const handleDepartureTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDepartureTimePicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      setDepartureTime(selectedDate);
      const timeStr = formatTimeForStorage(selectedDate);
      setFormData(prev => recalcProjectTime({ ...prev, site_departure_time: timeStr }));
    }
    if (Platform.OS === 'ios' && event.type === 'dismissed') {
      setShowDepartureTimePicker(false);
    }
  };

  // Date picker handler
  const formatDateForDisplay = (date: Date): string => {
    return date.toLocaleDateString('en-NZ', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDateForStorage = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'set' && date) {
      setSelectedDate(date);
      updateField('date', formatDateForStorage(date));
    }
    if (Platform.OS === 'ios' && event.type === 'dismissed') {
      setShowDatePicker(false);
    }
  };

  // Photo functions
  const requestPermissions = async () => {
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera and photo library permissions to add photos.');
      return false;
    }
    return true;
  };

  const requestLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  };

  // Weather fetching function
  const getWeatherDescription = (weatherCode: number): string => {
    const weatherCodes: { [key: number]: string } = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Foggy',
      48: 'Depositing rime fog',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Dense drizzle',
      56: 'Light freezing drizzle',
      57: 'Dense freezing drizzle',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      66: 'Light freezing rain',
      67: 'Heavy freezing rain',
      71: 'Slight snow',
      73: 'Moderate snow',
      75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Slight rain showers',
      81: 'Moderate rain showers',
      82: 'Violent rain showers',
      85: 'Slight snow showers',
      86: 'Heavy snow showers',
      95: 'Thunderstorm',
      96: 'Thunderstorm with slight hail',
      99: 'Thunderstorm with heavy hail',
    };
    return weatherCodes[weatherCode] || 'Unknown';
  };

  const fetchWeatherConditions = async () => {
    setFetchingWeather(true);
    try {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        Alert.alert('Permission Required', 'Please grant location permission to fetch weather conditions.');
        setFetchingWeather(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = location.coords;

      // Call Open-Meteo API (free, no API key required)
      const response = await axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
      );

      const current = response.data.current;
      const temp = Math.round(current.temperature_2m);
      const humidity = current.relative_humidity_2m;
      const weatherCode = current.weather_code;
      const windSpeed = Math.round(current.wind_speed_10m);
      const weatherDesc = getWeatherDescription(weatherCode);

      const weatherString = `${weatherDesc}, ${temp}°C, Humidity ${humidity}%, Wind ${windSpeed} km/h`;
      
      updateField('weather_conditions', weatherString);
      
    } catch (error) {
      console.error('Error fetching weather:', error);
      Alert.alert('Weather Error', 'Could not fetch weather conditions. Please enter manually.');
    } finally {
      setFetchingWeather(false);
    }
  };

  const getLocationAndAddress = async (): Promise<{
    latitude?: number;
    longitude?: number;
    address?: string;
  }> => {
    try {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        return {};
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;

      // Try to get address from coordinates
      let address = '';
      try {
        const [geocode] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocode) {
          const parts = [];
          if (geocode.streetNumber) parts.push(geocode.streetNumber);
          if (geocode.street) parts.push(geocode.street);
          if (geocode.city) parts.push(geocode.city);
          if (geocode.region) parts.push(geocode.region);
          address = parts.join(', ');
        }
      } catch (e) {
        console.log('Reverse geocoding failed:', e);
      }

      return { latitude, longitude, address };
    } catch (error) {
      console.log('Error getting location:', error);
      return {};
    }
  };

  const formatTimestamp = () => {
    const now = new Date();
    return now.toISOString();
  };

  const generatePhotoCaption = (timestamp: string, address?: string, latitude?: number, longitude?: number) => {
    const date = new Date(timestamp);
    const dateStr = date.toLocaleDateString('en-NZ', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
    const timeStr = date.toLocaleTimeString('en-NZ', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    let caption = `${dateStr} ${timeStr}`;
    if (address) {
      caption += ` - ${address}`;
    } else if (latitude && longitude) {
      caption += ` - GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    }
    return caption;
  };

  const getJobPrefix = (): string => {
    // Extract job number from job_no_name (e.g., "JOB-001 - Test Job" → "JOB-001")
    const jobNoName = formData.job_no_name;
    if (!jobNoName) return 'PHOTO';
    const dashIdx = jobNoName.indexOf(' - ');
    return dashIdx > 0 ? jobNoName.substring(0, dashIdx).trim() : jobNoName.trim();
  };

  const getNextPhotoNumber = (): number => {
    return formData.site_photos.length + 1;
  };

  const takePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    // Get location while camera is opening
    const locationPromise = getLocationAndAddress();

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const timestamp = formatTimestamp();
      const { latitude, longitude, address } = await locationPromise;
      const photoName = `${getJobPrefix()}-${getNextPhotoNumber()}`;
      
      const newPhoto: SitePhoto = {
        base64_data: `data:image/jpeg;base64,${result.assets[0].base64}`,
        caption: photoName,
        timestamp,
        latitude,
        longitude,
        address,
      };
      setFormData(prev => ({
        ...prev,
        site_photos: [...prev.site_photos, newPhoto],
      }));
    }
  };

  const pickFromLibrary = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    // Get current location for library photos too
    const locationPromise = getLocationAndAddress();

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const timestamp = formatTimestamp();
      const { latitude, longitude, address } = await locationPromise;
      const photoName = `${getJobPrefix()}-${getNextPhotoNumber()}`;
      
      const newPhoto: SitePhoto = {
        base64_data: `data:image/jpeg;base64,${result.assets[0].base64}`,
        caption: photoName,
        timestamp,
        latitude,
        longitude,
        address,
      };
      setFormData(prev => ({
        ...prev,
        site_photos: [...prev.site_photos, newPhoto],
      }));
    }
  };

  const removePhoto = (index: number) => {
    Alert.alert('Remove Photo', 'Are you sure you want to remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setFormData(prev => ({
            ...prev,
            site_photos: prev.site_photos.filter((_, i) => i !== index),
          }));
        },
      },
    ]);
  };

  const updatePhotoCaption = (index: number, caption: string) => {
    setFormData(prev => {
      const newPhotos = [...prev.site_photos];
      newPhotos[index] = { ...newPhotos[index], caption };
      return { ...prev, site_photos: newPhotos };
    });
  };

  const validateStep = (): boolean => {
    switch (currentStep) {
      case 0:
        if (!formData.staff_members || !formData.date || !formData.job_no_name) {
          Alert.alert('Required Fields', 'Please fill in Staff Member(s), Date, and Job No./Name');
          return false;
        }
        break;
      case 5: // Declaration step
        if (!formData.staff_print_name) {
          Alert.alert('Required Fields', 'Please enter your printed name');
          return false;
        }
        if (!formData.signature_data) {
          Alert.alert('Required Fields', 'Please provide your signature');
          return false;
        }
        break;
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep()) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const submitForm = async () => {
    if (!validateStep()) return;
    
    setSubmitting(true);
    try {
      // Build inspection_responses array from the dynamic state
      const inspResponses = Object.entries(inspectionResponses).map(([question, resp]) => ({
        question,
        answer: resp.answer,
        detail: resp.detail || null,
        answer_type: (inspectionItems[formData.inspection_type] || []).find(i => i.question === question)?.answer_type || 'yes_no',
      }));
      
      const submitData = {
        ...formData,
        inspection_responses: inspResponses,
      };
      
      const response = await axios.post(`${API_URL}/api/reports`, submitData);
      Alert.alert(
        'Success',
        'Report created successfully. What would you like to email?',
        [
          { text: 'Later', onPress: () => router.replace('/') },
          {
            text: 'Send Report',
            onPress: async () => {
              try {
                await axios.post(`${API_URL}/api/reports/${response.data.id}/email`, {
                  report_id: response.data.id
                });
                Alert.alert('Email Sent', 'Report PDF has been emailed successfully');
                router.replace('/');
              } catch (error) {
                Alert.alert('Email Failed', 'Report saved but email failed to send');
                router.replace('/');
              }
            },
          },
          {
            text: 'Send Photos',
            onPress: async () => {
              try {
                await axios.post(`${API_URL}/api/reports/${response.data.id}/email-photos`, {
                  report_id: response.data.id
                });
                Alert.alert('Photos Sent', 'Site photos have been emailed successfully');
                router.replace('/');
              } catch (error) {
                Alert.alert('Email Failed', 'Report saved but photos email failed to send');
                router.replace('/');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting form:', error);
      Alert.alert('Error', 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {steps.map((step, index) => (
        <TouchableOpacity 
          key={step} 
          style={styles.stepItem}
          onPress={() => {
            if (index < currentStep) setCurrentStep(index);
          }}
        >
          <View style={[
            styles.stepCircle,
            index === currentStep && styles.stepCircleActive,
            index < currentStep && styles.stepCircleCompleted,
          ]}>
            {index < currentStep ? (
              <Ionicons name="checkmark" size={12} color="#fff" />
            ) : (
              <Text style={[
                styles.stepNumber,
                (index === currentStep || index < currentStep) && styles.stepNumberActive,
              ]}>
                {index + 1}
              </Text>
            )}
          </View>
          <Text style={[
            styles.stepLabel,
            index === currentStep && styles.stepLabelActive,
          ]}>
            {step}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderSiteInfoStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Staff Member(s) *</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowStaffPicker(true)}
        >
          <Ionicons name="people-outline" size={20} color="#4CAF50" />
          <Text style={[
            styles.pickerButtonText,
            !formData.staff_members && styles.pickerButtonPlaceholder
          ]}>
            {formData.staff_members || 'Select staff members'}
          </Text>
          <Ionicons name="chevron-down" size={20} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Date *</Text>
          <TouchableOpacity 
            style={styles.datePickerButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color="#4CAF50" />
            <Text style={styles.datePickerText}>
              {formatDateForDisplay(selectedDate)}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            Platform.OS === 'ios' ? (
              <Modal
                visible={showDatePicker}
                transparent
                animationType="slide"
              >
                <View style={styles.timePickerModal}>
                  <View style={styles.timePickerModalContent}>
                    <View style={styles.timePickerHeader}>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text style={styles.timePickerCancel}>Cancel</Text>
                      </TouchableOpacity>
                      <Text style={styles.timePickerTitle}>Select Date</Text>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text style={styles.timePickerDone}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={selectedDate}
                      mode="date"
                      display="spinner"
                      onChange={handleDateChange}
                      style={{ height: 200 }}
                    />
                  </View>
                </View>
              </Modal>
            ) : (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="default"
                onChange={handleDateChange}
              />
            )
          )}
        </View>
        <View style={{ width: 12 }} />
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Job No. / Name *</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowJobPicker(true)}
          >
            <Ionicons name="briefcase-outline" size={20} color="#4CAF50" />
            <Text style={[
              styles.pickerButtonText,
              !formData.job_no_name && styles.pickerButtonPlaceholder
            ]} numberOfLines={1}>
              {formData.job_no_name || 'Select job'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#999" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Job Address */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Job Address</Text>
        <View style={styles.addressRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={formData.job_address}
            onChangeText={(text) => {
              updateField('job_address', text);
              setAddressValidated(false);
            }}
            placeholder="Enter or edit job address..."
          />
          <TouchableOpacity
            style={[styles.validateButton, validatingAddress && { opacity: 0.6 }]}
            onPress={() => validateAddress(formData.job_address)}
            disabled={validatingAddress || !formData.job_address}
          >
            {validatingAddress ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="search" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
        
        {/* Address suggestions */}
        {showAddressSuggestions && addressSuggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.suggestionsTitle}>Select verified address:</Text>
            {addressSuggestions.map((s, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.suggestionItem}
                onPress={() => selectAddressSuggestion(s)}
              >
                <Ionicons name="location" size={16} color="#4CAF50" />
                <Text style={styles.suggestionText} numberOfLines={2}>{s.display_name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.dismissSuggestions}
              onPress={() => setShowAddressSuggestions(false)}
            >
              <Text style={styles.dismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Validated address badge + map link */}
        {addressValidated && formData.job_address_lat && (
          <View style={styles.validatedRow}>
            <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
            <Text style={styles.validatedText}>Address verified</Text>
            <TouchableOpacity style={styles.mapButton} onPress={openInMaps}>
              <Ionicons name="map-outline" size={16} color="#fff" />
              <Text style={styles.mapButtonText}>View on Map</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Departure Office & Distance */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Departure Office</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { key: 'hastings', label: 'Hastings' },
            { key: 'palmerston_north', label: 'Palmerston North' },
          ].map((office) => (
            <TouchableOpacity
              key={office.key}
              style={[
                styles.optionButton, { flex: 1, paddingVertical: 12 },
                formData.departure_office === office.key && styles.optionButtonActive,
              ]}
              onPress={() => {
                updateField('departure_office', office.key);
                if (formData.job_address) {
                  estimateDistance(office.key, formData.job_address);
                }
              }}
            >
              <Text style={[
                styles.optionText,
                formData.departure_office === office.key && styles.optionTextActive,
              ]}>{office.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {(distanceMessage || calculatingDistance) && (
          <View style={{
            marginTop: 8,
            padding: 10,
            backgroundColor: formData.estimated_km ? '#E8F5E9' : '#FFF3E0',
            borderRadius: 8,
            flexDirection: 'row',
            alignItems: 'center',
          }}>
            {calculatingDistance ? (
              <ActivityIndicator size="small" color="#4CAF50" style={{ marginRight: 8 }} />
            ) : (
              <Text style={{ marginRight: 6, fontSize: 16 }}>
                {formData.estimated_km ? '🚗' : '⚠️'}
              </Text>
            )}
            <Text style={{
              fontSize: 14,
              fontWeight: formData.estimated_km ? '700' : '400',
              color: formData.estimated_km ? '#2E7D32' : '#E65100',
            }}>
              {calculatingDistance ? 'Calculating distance...' : distanceMessage}
            </Text>
          </View>
        )}
      </View>

      {/* Purpose of Visit */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Purpose of Visit</Text>
        <View style={styles.purposeContainer}>
          {VISIT_PURPOSE_OPTIONS.map((purpose) => (
            <TouchableOpacity
              key={purpose}
              style={styles.purposeItem}
              onPress={() => {
                setFormData(prev => {
                  const current = prev.purpose_of_visit;
                  const updated = current.includes(purpose)
                    ? current.filter(p => p !== purpose)
                    : [...current, purpose];
                  return { ...prev, purpose_of_visit: updated };
                });
              }}
            >
              <View style={[
                styles.purposeCheckbox,
                formData.purpose_of_visit.includes(purpose) && styles.purposeCheckboxActive,
              ]}>
                {formData.purpose_of_visit.includes(purpose) && (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
              </View>
              <Text style={styles.purposeText}>{purpose}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Arrival Time</Text>
          <TouchableOpacity 
            style={styles.timePickerButton}
            onPress={() => setShowArrivalTimePicker(true)}
          >
            <Ionicons name="time-outline" size={20} color="#4CAF50" />
            <Text style={[
              styles.timePickerText,
              !formData.site_arrival_time && styles.timePickerPlaceholder
            ]}>
              {formData.site_arrival_time || 'Select time'}
            </Text>
          </TouchableOpacity>
          {showArrivalTimePicker && (
            Platform.OS === 'ios' ? (
              <Modal
                visible={showArrivalTimePicker}
                transparent
                animationType="slide"
              >
                <View style={styles.timePickerModal}>
                  <View style={styles.timePickerModalContent}>
                    <View style={styles.timePickerHeader}>
                      <TouchableOpacity onPress={() => setShowArrivalTimePicker(false)}>
                        <Text style={styles.timePickerCancel}>Cancel</Text>
                      </TouchableOpacity>
                      <Text style={styles.timePickerTitle}>Arrival Time</Text>
                      <TouchableOpacity onPress={() => setShowArrivalTimePicker(false)}>
                        <Text style={styles.timePickerDone}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={arrivalTime || new Date()}
                      mode="time"
                      display="spinner"
                      onChange={handleArrivalTimeChange}
                      style={{ height: 200 }}
                    />
                  </View>
                </View>
              </Modal>
            ) : (
              <DateTimePicker
                value={arrivalTime || new Date()}
                mode="time"
                display="default"
                onChange={handleArrivalTimeChange}
              />
            )
          )}
        </View>
        <View style={{ width: 12 }} />
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Departure Time</Text>
          <TouchableOpacity 
            style={styles.timePickerButton}
            onPress={() => setShowDepartureTimePicker(true)}
          >
            <Ionicons name="time-outline" size={20} color="#4CAF50" />
            <Text style={[
              styles.timePickerText,
              !formData.site_departure_time && styles.timePickerPlaceholder
            ]}>
              {formData.site_departure_time || 'Select time'}
            </Text>
          </TouchableOpacity>
          {showDepartureTimePicker && (
            Platform.OS === 'ios' ? (
              <Modal
                visible={showDepartureTimePicker}
                transparent
                animationType="slide"
              >
                <View style={styles.timePickerModal}>
                  <View style={styles.timePickerModalContent}>
                    <View style={styles.timePickerHeader}>
                      <TouchableOpacity onPress={() => setShowDepartureTimePicker(false)}>
                        <Text style={styles.timePickerCancel}>Cancel</Text>
                      </TouchableOpacity>
                      <Text style={styles.timePickerTitle}>Departure Time</Text>
                      <TouchableOpacity onPress={() => setShowDepartureTimePicker(false)}>
                        <Text style={styles.timePickerDone}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={departureTime || new Date()}
                      mode="time"
                      display="spinner"
                      onChange={handleDepartureTimeChange}
                      style={{ height: 200 }}
                    />
                  </View>
                </View>
              </Modal>
            ) : (
              <DateTimePicker
                value={departureTime || new Date()}
                mode="time"
                display="default"
                onChange={handleDepartureTimeChange}
              />
            )
          )}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Site Description</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowSiteTypePicker(true)}
        >
          <Ionicons name="location-outline" size={20} color="#4CAF50" />
          <Text style={[
            styles.pickerButtonText,
            !formData.site_description.split('\n')[0] && styles.pickerButtonPlaceholder
          ]} numberOfLines={1}>
            {formData.site_description.split('\n')[0] || 'Select site type'}
          </Text>
          <Ionicons name="chevron-down" size={20} color="#999" />
        </TouchableOpacity>
        <TextInput
          style={[styles.input, styles.textArea, { marginTop: 8 }]}
          value={formData.site_description.includes('\n') ? formData.site_description.split('\n').slice(1).join('\n') : ''}
          onChangeText={(text) => {
            const siteType = formData.site_description.split('\n')[0] || '';
            updateField('site_description', text ? `${siteType}\n${text}` : siteType);
          }}
          placeholder="Additional notes about the site..."
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Project Time Summary */}
      <View style={[styles.inputGroup, { backgroundColor: '#F1F8E9', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#C5E1A5' }]}>
        <Text style={[styles.label, { fontSize: 15, fontWeight: '700', color: '#33691E', marginBottom: 10 }]}>Project Time Estimate</Text>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 13, color: '#555' }}>Time on site:</Text>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>
            {formData.time_on_site_minutes ? `${formData.time_on_site_minutes} min` : '—'}
          </Text>
        </View>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 13, color: '#555' }}>Travel time (return):</Text>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>
            {formData.estimated_travel_minutes ? `${formData.estimated_travel_minutes * 2} min` : '—'}
          </Text>
        </View>
        
        <View style={{ height: 1, backgroundColor: '#AED581', marginVertical: 8 }} />
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#33691E' }}>Total Project Time:</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TextInput
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: '#2E7D32',
                backgroundColor: '#fff',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#AED581',
                paddingHorizontal: 10,
                paddingVertical: 4,
                width: 70,
                textAlign: 'center',
              }}
              value={formData.total_project_hours !== null ? String(formData.total_project_hours) : ''}
              onChangeText={(text) => {
                const val = parseFloat(text);
                updateField('total_project_hours', isNaN(val) ? null : val);
              }}
              keyboardType="decimal-pad"
              placeholder="0.0"
            />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#33691E' }}>hrs</Text>
          </View>
        </View>
        
        <Text style={{ fontSize: 11, color: '#689F38', marginTop: 6, fontStyle: 'italic' }}>
          Auto-calculated. Tap the hours to manually adjust.
        </Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Weather Conditions</Text>
        <View style={styles.weatherContainer}>
          <TextInput
            style={styles.weatherInput}
            value={formData.weather_conditions}
            onChangeText={(text) => updateField('weather_conditions', text)}
            placeholder="e.g., Sunny, 20°C"
          />
          <TouchableOpacity 
            style={styles.weatherButton}
            onPress={fetchWeatherConditions}
            disabled={fetchingWeather}
          >
            {fetchingWeather ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="cloud-outline" size={22} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.weatherHint}>
          Tap the cloud icon to auto-fetch current weather from your location
        </Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Contractor Responsible</Text>
        <TextInput
          style={styles.input}
          value={formData.contractor_responsible}
          onChangeText={(text) => updateField('contractor_responsible', text)}
          placeholder="Contractor name"
        />
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderHazardsStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Risks / Hazards / Incidents</Text>
        <Text style={styles.hint}>Record any specific risks, hazards, or incidents that occur while on site</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.risks_hazards_incidents}
          onChangeText={(text) => updateField('risks_hazards_incidents', text)}
          placeholder="Describe any risks, hazards, or incidents..."
          multiline
          numberOfLines={5}
        />
      </View>

      <View style={styles.switchGroup}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Toolbox Talk / Follow-up Required?</Text>
          <Text style={styles.hint}>Is a Toolbox Talk, remedial discussions and/or follow-up required?</Text>
        </View>
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              !formData.toolbox_talk_required && styles.toggleButtonActive,
            ]}
            onPress={() => updateField('toolbox_talk_required', false)}
          >
            <Text style={[
              styles.toggleText,
              !formData.toolbox_talk_required && styles.toggleTextActive,
            ]}>No</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              formData.toolbox_talk_required && styles.toggleButtonActive,
            ]}
            onPress={() => updateField('toolbox_talk_required', true)}
          >
            <Text style={[
              styles.toggleText,
              formData.toolbox_talk_required && styles.toggleTextActive,
            ]}>Yes</Text>
          </TouchableOpacity>
        </View>
      </View>

      {formData.toolbox_talk_required && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.toolbox_talk_notes}
            onChangeText={(text) => updateField('toolbox_talk_notes', text)}
            placeholder="Describe required follow-up..."
            multiline
            numberOfLines={3}
          />
        </View>
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderSafetyStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Checklist Comments</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.checklist_comments}
          onChangeText={(text) => updateField('checklist_comments', text)}
          placeholder="General comments..."
          multiline
          numberOfLines={2}
        />
      </View>

      <Text style={styles.sectionTitle}>Safety Checklist</Text>
      
      {formData.safety_checklist.map((item, index) => (
        <View key={index} style={styles.checklistItem}>
          <Text style={styles.checklistQuestion}>{item.question}</Text>
          <View style={styles.checklistOptions}>
            {['yes', 'no', 'na'].map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  item.answer === option && styles.optionButtonActive,
                ]}
                onPress={() => updateChecklistItem(index, 'answer', option)}
              >
                <Text style={[
                  styles.optionText,
                  item.answer === option && styles.optionTextActive,
                ]}>
                  {option.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.checklistNotes}
            value={item.notes}
            onChangeText={(text) => updateChecklistItem(index, 'notes', text)}
            placeholder="Add notes / comments..."
            placeholderTextColor="#bbb"
            multiline
          />
          {(item.question.includes('electrical') && item.answer === 'yes') && (
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={formData.electrical_equipment_list}
              onChangeText={(text) => updateField('electrical_equipment_list', text)}
              placeholder="List electrical equipment..."
            />
          )}
        </View>
      ))}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderDynamicInspectionItem = (item: {question: string, answer_type: string, options: string}, index: number) => {
    const resp = inspectionResponses[item.question] || { answer: '', detail: '' };
    const optionsList = item.options ? item.options.split(',').map(o => o.trim()).filter(o => o) : [];

    if (item.answer_type === 'yes_no') {
      return (
        <View key={`insp-${index}`} style={styles.inputGroup}>
          <Text style={styles.label}>{item.question}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {['Yes', 'No'].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.optionButton, { flex: 1, paddingVertical: 12 },
                  resp.answer === opt && styles.optionButtonActive,
                ]}
                onPress={() => updateInspectionResponse(item.question, opt)}
              >
                <Text style={[
                  styles.optionText,
                  resp.answer === opt && styles.optionTextActive,
                ]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    if (item.answer_type === 'select') {
      return (
        <View key={`insp-${index}`} style={styles.inputGroup}>
          <Text style={styles.label}>{item.question}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {optionsList.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.optionButton, { paddingHorizontal: 16, paddingVertical: 12 },
                  resp.answer === opt && styles.optionButtonActive,
                ]}
                onPress={() => updateInspectionResponse(item.question, opt)}
              >
                <Text style={[
                  styles.optionText,
                  resp.answer === opt && styles.optionTextActive,
                ]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    if (item.answer_type === 'yes_no_select') {
      return (
        <View key={`insp-${index}`} style={styles.inputGroup}>
          <Text style={styles.label}>{item.question}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {['Yes', 'No'].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.optionButton, { flex: 1, paddingVertical: 12 },
                  resp.answer === opt && styles.optionButtonActive,
                ]}
                onPress={() => updateInspectionResponse(item.question, opt)}
              >
                <Text style={[
                  styles.optionText,
                  resp.answer === opt && styles.optionTextActive,
                ]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {optionsList.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: 8, fontSize: 13 }]}>Type/Size</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {optionsList.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.optionButton, { paddingHorizontal: 16, paddingVertical: 12 },
                      resp.detail === opt && styles.optionButtonActive,
                    ]}
                    onPress={() => updateInspectionDetail(item.question, opt)}
                  >
                    <Text style={[
                      styles.optionText,
                      resp.detail === opt && styles.optionTextActive,
                    ]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      );
    }

    // Default: text input
    return (
      <View key={`insp-${index}`} style={styles.inputGroup}>
        <Text style={styles.label}>{item.question}</Text>
        <TextInput
          style={styles.input}
          value={resp.answer}
          onChangeText={(text) => updateInspectionResponse(item.question, text)}
          placeholder="Enter value..."
        />
      </View>
    );
  };

  const renderInspectionStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {/* Main tick box */}
      <TouchableOpacity
        style={styles.inspectionToggle}
        onPress={() => updateField('building_consent_inspection', !formData.building_consent_inspection)}
      >
        <View style={[
          styles.purposeCheckbox,
          { width: 30, height: 30 },
          formData.building_consent_inspection && styles.purposeCheckboxActive,
        ]}>
          {formData.building_consent_inspection && (
            <Ionicons name="checkmark" size={20} color="#fff" />
          )}
        </View>
        <Text style={styles.inspectionToggleText}>Building Consent Requirement Inspection</Text>
      </TouchableOpacity>

      {formData.building_consent_inspection && (
        <View style={styles.inspectionContent}>
          {/* Dynamic Inspection Type Selector */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Inspection Type</Text>
            {inspectionTypes.map((typeName) => (
              <TouchableOpacity
                key={typeName}
                style={[
                  styles.inspectionOption,
                  formData.inspection_type === typeName && styles.inspectionApproved,
                ]}
                onPress={() => {
                  updateField('inspection_type', typeName);
                  // Reset responses when switching type
                  setInspectionResponses({});
                }}
              >
                <View style={[
                  styles.inspectionRadio,
                  formData.inspection_type === typeName && { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
                ]}>
                  {formData.inspection_type === typeName && <View style={styles.inspectionRadioDot} />}
                </View>
                <Text style={[
                  styles.inspectionOptionText,
                  formData.inspection_type === typeName && { fontWeight: '700', color: '#2E7D32' },
                ]}>{typeName}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Dynamic Inspection Sub-fields */}
          {formData.inspection_type && inspectionItems[formData.inspection_type] && (
            <View style={styles.pendingSubFields}>
              <Text style={[styles.label, { fontSize: 15, fontWeight: '700', marginBottom: 12, color: '#2E7D32' }]}>
                {formData.inspection_type} Details
              </Text>
              {inspectionItems[formData.inspection_type].map((item, index) =>
                renderDynamicInspectionItem(item, index)
              )}
            </View>
          )}

          {/* Inspection Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Inspection Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.inspection_notes}
              onChangeText={(text) => updateField('inspection_notes', text)}
              placeholder="Enter inspection notes..."
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Inspection Result Selector */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Inspection Result</Text>
            
            {/* Approved */}
            <TouchableOpacity
              style={[
                styles.inspectionOption,
                formData.inspection_result === 'approved' && styles.inspectionApproved,
              ]}
              onPress={() => updateField('inspection_result', 'approved')}
            >
              <View style={[
                styles.inspectionRadio,
                formData.inspection_result === 'approved' && { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
              ]}>
                {formData.inspection_result === 'approved' && (
                  <View style={styles.inspectionRadioDot} />
                )}
              </View>
              <Text style={[
                styles.inspectionOptionText,
                formData.inspection_result === 'approved' && { fontWeight: '700', color: '#2E7D32' },
              ]}>
                Inspection Approved - OK to proceed
              </Text>
              {formData.inspection_result === 'approved' && (
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              )}
            </TouchableOpacity>

            {/* Pending */}
            <TouchableOpacity
              style={[
                styles.inspectionOption,
                formData.inspection_result === 'pending' && styles.inspectionPending,
              ]}
              onPress={() => updateField('inspection_result', 'pending')}
            >
              <View style={[
                styles.inspectionRadio,
                formData.inspection_result === 'pending' && { borderColor: '#FF9800', backgroundColor: '#FF9800' },
              ]}>
                {formData.inspection_result === 'pending' && (
                  <View style={styles.inspectionRadioDot} />
                )}
              </View>
              <Text style={[
                styles.inspectionOptionText,
                formData.inspection_result === 'pending' && { fontWeight: '700', color: '#E65100' },
              ]}>
                Inspection Approval pending completion of above
              </Text>
              {formData.inspection_result === 'pending' && (
                <Ionicons name="warning" size={24} color="#FF9800" />
              )}
            </TouchableOpacity>

            {/* Pending sub-fields */}
            {formData.inspection_result === 'pending' && (
              <View style={styles.pendingSubFields}>
                <TouchableOpacity
                  style={styles.evidenceRow}
                  onPress={() => updateField('evidence_received', !formData.evidence_received)}
                >
                  <View style={[
                    styles.purposeCheckbox,
                    formData.evidence_received && { backgroundColor: '#FF9800', borderColor: '#FF9800' },
                  ]}>
                    {formData.evidence_received && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.evidenceText}>Evidence of work completion received</Text>
                </TouchableOpacity>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Date</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.evidence_date}
                    onChangeText={(text) => updateField('evidence_date', text)}
                    placeholder="DD/MM/YYYY"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Signature</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.evidence_signature}
                    onChangeText={(text) => {
                      updateField('evidence_signature', text);
                      updateField('evidence_signature_type', 'typed');
                    }}
                    placeholder="Type name as signature"
                  />
                </View>
              </View>
            )}

            {/* Reinspection Required */}
            <TouchableOpacity
              style={[
                styles.inspectionOption,
                formData.inspection_result === 'reinspection' && styles.inspectionReinspection,
              ]}
              onPress={() => updateField('inspection_result', 'reinspection')}
            >
              <View style={[
                styles.inspectionRadio,
                formData.inspection_result === 'reinspection' && { borderColor: '#F44336', backgroundColor: '#F44336' },
              ]}>
                {formData.inspection_result === 'reinspection' && (
                  <View style={styles.inspectionRadioDot} />
                )}
              </View>
              <Text style={[
                styles.inspectionOptionText,
                formData.inspection_result === 'reinspection' && { fontWeight: '700', color: '#C62828' },
              ]}>
                Reinspection required
              </Text>
              {formData.inspection_result === 'reinspection' && (
                <Ionicons name="alert-circle" size={24} color="#F44336" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!formData.building_consent_inspection && (
        <View style={styles.inspectionDisabled}>
          <Ionicons name="information-circle-outline" size={24} color="#999" />
          <Text style={styles.inspectionDisabledText}>
            Tick the box above if this visit includes a building consent inspection
          </Text>
        </View>
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderPhotosStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <View style={styles.photoHeader}>
        <Text style={styles.sectionTitle}>Site Photos</Text>
        <Text style={styles.photoCount}>{formData.site_photos.length} photo(s)</Text>
      </View>
      
      <Text style={styles.hint}>Add photos to document the site conditions</Text>

      {/* Photo Action Buttons */}
      <View style={styles.photoActions}>
        <TouchableOpacity style={styles.photoActionButton} onPress={takePhoto}>
          <Ionicons name="camera" size={28} color="#4CAF50" />
          <Text style={styles.photoActionText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.photoActionButton} onPress={pickFromLibrary}>
          <Ionicons name="images" size={28} color="#4CAF50" />
          <Text style={styles.photoActionText}>From Library</Text>
        </TouchableOpacity>
      </View>

      {/* Photo Grid */}
      {formData.site_photos.length > 0 ? (
        <View style={styles.photoGrid}>
          {formData.site_photos.map((photo, index) => (
            <View key={index} style={styles.photoCard}>
              <Image
                source={{ uri: photo.base64_data }}
                style={styles.photoImage}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={() => removePhoto(index)}
              >
                <Ionicons name="close-circle" size={24} color="#F44336" />
              </TouchableOpacity>
              <View style={styles.photoNameBadge}>
                <Text style={styles.photoNameText}>{photo.caption?.split('\n')[0] || `${getJobPrefix()}-${index + 1}`}</Text>
              </View>
              <View style={styles.captionContainer}>
                <Text style={styles.photoLabel}>Photo Name</Text>
                <TextInput
                  style={styles.photoNameInput}
                  value={photo.caption?.split('\n')[0] || ''}
                  onChangeText={(text) => {
                    const comment = photo.caption?.includes('\n') ? photo.caption.split('\n').slice(1).join('\n') : '';
                    updatePhotoCaption(index, comment ? `${text}\n${comment}` : text);
                  }}
                  placeholder={`${getJobPrefix()}-${index + 1}`}
                  placeholderTextColor="#999"
                />
                <Text style={styles.photoLabel}>Comment</Text>
                <TextInput
                  style={styles.photoCommentInput}
                  value={photo.caption?.includes('\n') ? photo.caption.split('\n').slice(1).join('\n') : ''}
                  onChangeText={(text) => {
                    const name = photo.caption?.split('\n')[0] || `${getJobPrefix()}-${index + 1}`;
                    updatePhotoCaption(index, text ? `${name}\n${text}` : name);
                  }}
                  placeholder="Add comment about this photo..."
                  placeholderTextColor="#bbb"
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.noPhotosContainer}>
          <Ionicons name="camera-outline" size={64} color="#ddd" />
          <Text style={styles.noPhotosText}>No photos added yet</Text>
          <Text style={styles.noPhotosSubtext}>Tap the buttons above to add site photos</Text>
        </View>
      )}
      
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderDeclarationStep = () => {
    return (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <View style={styles.declarationBox}>
        <Text style={styles.declarationText}>
          I acknowledge that I, the undersigned, understand the points above. 
          I accept that compliance to safe work practices is a condition of my 
          continued access to the site and also a requirement under the HSW legislation.
        </Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Staff Member (Print Name) *</Text>
        {formData.staff_members ? (
          <View>
            {formData.staff_members.split(',').map((name) => name.trim()).filter(Boolean).map((name) => (
              <TouchableOpacity
                key={name}
                style={[
                  styles.inspectionOption,
                  formData.staff_print_name === name && styles.inspectionApproved,
                ]}
                onPress={() => updateField('staff_print_name', name)}
              >
                <View style={[
                  styles.inspectionRadio,
                  formData.staff_print_name === name && { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
                ]}>
                  {formData.staff_print_name === name && (
                    <View style={styles.inspectionRadioDot} />
                  )}
                </View>
                <Text style={[
                  styles.inspectionOptionText,
                  formData.staff_print_name === name && { fontWeight: '700', color: '#2E7D32' },
                ]}>
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <TextInput
            style={styles.input}
            value={formData.staff_print_name}
            onChangeText={(text) => updateField('staff_print_name', text)}
            placeholder="Enter your name"
          />
        )}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          value={formData.declaration_date}
          onChangeText={(text) => updateField('declaration_date', text)}
          placeholder="YYYY-MM-DD"
        />
      </View>

      <View style={styles.signatureSection}>
        <Text style={styles.label}>Signature *</Text>
        
        <View style={styles.signatureTypeToggle}>
          <TouchableOpacity
            style={[
              styles.sigTypeButton,
              formData.signature_type === 'typed' && styles.sigTypeButtonActive,
            ]}
            onPress={() => {
              updateField('signature_type', 'typed');
              updateField('signature_data', '');
            }}
          >
            <Ionicons name="text" size={18} color={formData.signature_type === 'typed' ? '#fff' : '#4CAF50'} />
            <Text style={[
              styles.sigTypeText,
              formData.signature_type === 'typed' && styles.sigTypeTextActive,
            ]}>Type</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sigTypeButton,
              formData.signature_type === 'drawn' && styles.sigTypeButtonActive,
            ]}
            onPress={() => {
              updateField('signature_type', 'drawn');
              updateField('signature_data', '');
            }}
          >
            <Ionicons name="pencil" size={18} color={formData.signature_type === 'drawn' ? '#fff' : '#4CAF50'} />
            <Text style={[
              styles.sigTypeText,
              formData.signature_type === 'drawn' && styles.sigTypeTextActive,
            ]}>Draw</Text>
          </TouchableOpacity>
        </View>

        {formData.signature_type === 'typed' ? (
          <View>
            <TextInput
              style={styles.input}
              value={formData.signature_data}
              onChangeText={(text) => updateField('signature_data', text)}
              placeholder="Type your name"
            />
            {formData.signature_data ? (
              <View style={styles.signaturePreview}>
                <Text style={styles.typedSignature}>{formData.signature_data}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View>
            <TouchableOpacity
              style={styles.signaturePadButton}
              onPress={() => setShowSignaturePad(true)}
            >
              {formData.signature_data ? (
                <Text style={styles.signatureAdded}>Signature added - Tap to change</Text>
              ) : (
                <>
                  <Ionicons name="create-outline" size={32} color="#4CAF50" />
                  <Text style={styles.signaturePadText}>Tap to sign</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return renderSiteInfoStep();
      case 1: return renderHazardsStep();
      case 2: return renderSafetyStep();
      case 3: return renderInspectionStep();
      case 4: return renderPhotosStep();
      case 5: return renderDeclarationStep();
      default: return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {renderStepIndicator()}
        {renderCurrentStep()}
        
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.navButton, currentStep === 0 && styles.navButtonDisabled]}
            onPress={prevStep}
            disabled={currentStep === 0}
          >
            <Ionicons name="chevron-back" size={20} color={currentStep === 0 ? '#ccc' : '#4CAF50'} />
            <Text style={[styles.navButtonText, currentStep === 0 && styles.navButtonTextDisabled]}>Back</Text>
          </TouchableOpacity>

          {currentStep < steps.length - 1 ? (
            <TouchableOpacity style={styles.nextButton} onPress={nextStep}>
              <Text style={styles.nextButtonText}>Next</Text>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.submitButton}
              onPress={submitForm}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>Submit</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Signature Pad Modal */}
      <Modal
        visible={showSignaturePad}
        animationType="slide"
        onRequestClose={() => setShowSignaturePad(false)}
      >
        <SafeAreaView style={styles.signatureModal}>
          <View style={styles.signatureHeader}>
            <TouchableOpacity onPress={() => setShowSignaturePad(false)}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={styles.signatureModalTitle}>Draw Your Signature</Text>
            <TouchableOpacity onPress={clearSignature}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.signatureCanvasContainer}>
            <SignatureCanvas
              ref={signatureRef}
              onOK={handleSignature}
              onEmpty={() => Alert.alert('Error', 'Please provide your signature')}
              descriptionText=""
              clearText="Clear"
              confirmText="Save"
              webStyle={`
                .m-signature-pad { box-shadow: none; border: 1px solid #ddd; }
                .m-signature-pad--body { border: none; }
                .m-signature-pad--footer { display: none; }
              `}
              autoClear={false}
              imageType="image/png"
            />
          </View>
          <View style={styles.signatureModalFooter}>
            <TouchableOpacity
              style={styles.signatureSaveButton}
              onPress={() => signatureRef.current?.readSignature()}
            >
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.signatureSaveText}>Save Signature</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Staff Picker Modal */}
      <Modal
        visible={showStaffPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowStaffPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Select Staff Members</Text>
              <TouchableOpacity onPress={() => setShowStaffPicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.pickerList}>
              {staffList.map((staff) => (
                <TouchableOpacity
                  key={staff.id}
                  style={styles.pickerItem}
                  onPress={() => toggleStaffSelection(staff.name)}
                >
                  <Ionicons 
                    name={selectedStaff.includes(staff.name) ? "checkbox" : "square-outline"} 
                    size={24} 
                    color={selectedStaff.includes(staff.name) ? "#4CAF50" : "#999"} 
                  />
                  <Text style={styles.pickerItemText}>{staff.name}</Text>
                </TouchableOpacity>
              ))}
              
              {staffList.length === 0 && (
                <Text style={styles.emptyListText}>No staff members yet. Add one below.</Text>
              )}
            </ScrollView>
            
            <View style={styles.addNewSection}>
              <Text style={styles.addNewLabel}>Add New Staff Member</Text>
              <View style={styles.addNewRow}>
                <TextInput
                  style={styles.addNewInput}
                  value={newStaffName}
                  onChangeText={setNewStaffName}
                  placeholder="Staff name"
                />
                <TouchableOpacity 
                  style={styles.addNewButton}
                  onPress={addNewStaff}
                >
                  <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            
            <TouchableOpacity 
              style={styles.pickerDoneButton}
              onPress={() => setShowStaffPicker(false)}
            >
              <Text style={styles.pickerDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Job Picker Modal */}
      <Modal
        visible={showJobPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowJobPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Select Job</Text>
              <TouchableOpacity onPress={() => setShowJobPicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.pickerList}>
              {jobsList.map((job) => (
                <TouchableOpacity
                  key={job.id}
                  style={styles.pickerItem}
                  onPress={() => {
                    const jobDisplay = `${job.job_number} - ${job.job_name}`;
                    updateField('job_no_name', jobDisplay);
                    // Auto-fill address from job data
                    if (job.job_address) {
                      setFormData(prev => ({
                        ...prev,
                        job_no_name: jobDisplay,
                        job_address: job.job_address || '',
                      }));
                      // Auto-validate the address
                      validateAddress(job.job_address);
                    }
                    setShowJobPicker(false);
                  }}
                >
                  <Ionicons name="briefcase-outline" size={20} color="#4CAF50" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.jobNumber}>{job.job_number}</Text>
                    <Text style={styles.jobName}>{job.job_name}</Text>
                  </View>
                  {formData.job_no_name === `${job.job_number} - ${job.job_name}` && (
                    <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              ))}
              
              {jobsList.length === 0 && (
                <Text style={styles.emptyListText}>No jobs yet. Add one below.</Text>
              )}
            </ScrollView>
            
            <View style={styles.addNewSection}>
              <Text style={styles.addNewLabel}>Add New Job</Text>
              <TextInput
                style={[styles.addNewInput, { marginBottom: 8 }]}
                value={newJobNumber}
                onChangeText={setNewJobNumber}
                placeholder="Job number (e.g., JOB-001)"
              />
              <View style={styles.addNewRow}>
                <TextInput
                  style={styles.addNewInput}
                  value={newJobName}
                  onChangeText={setNewJobName}
                  placeholder="Job name"
                />
                <TouchableOpacity 
                  style={styles.addNewButton}
                  onPress={addNewJob}
                >
                  <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            
            <TouchableOpacity 
              style={styles.pickerDoneButton}
              onPress={() => setShowJobPicker(false)}
            >
              <Text style={styles.pickerDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Site Type Picker Modal */}
      <Modal
        visible={showSiteTypePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSiteTypePicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Select Site Type</Text>
              <TouchableOpacity onPress={() => setShowSiteTypePicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.pickerList}>
              {SITE_TYPE_OPTIONS.map((siteType) => {
                const currentType = formData.site_description.split('\n')[0];
                const isSelected = currentType === siteType;
                return (
                  <TouchableOpacity
                    key={siteType}
                    style={[styles.pickerItem, isSelected && { backgroundColor: '#e8f5e9' }]}
                    onPress={() => {
                      const notes = formData.site_description.includes('\n') 
                        ? formData.site_description.split('\n').slice(1).join('\n') 
                        : '';
                      updateField('site_description', notes ? `${siteType}\n${notes}` : siteType);
                      setShowSiteTypePicker(false);
                    }}
                  >
                    <Ionicons name="location-outline" size={20} color="#4CAF50" />
                    <Text style={[styles.pickerItemText, { marginLeft: 10 }]}>{siteType}</Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            
            <TouchableOpacity 
              style={styles.pickerDoneButton}
              onPress={() => setShowSiteTypePicker(false)}
            >
              <Text style={styles.pickerDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  stepItem: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepCircleActive: {
    backgroundColor: '#4CAF50',
  },
  stepCircleCompleted: {
    backgroundColor: '#4CAF50',
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLabel: {
    fontSize: 10,
    color: '#999',
  },
  stepLabelActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  stepContent: {
    flex: 1,
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 6,
  },
  hint: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  // Time picker styles
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    gap: 10,
  },
  timePickerText: {
    fontSize: 15,
    color: '#333',
  },
  timePickerPlaceholder: {
    color: '#999',
  },
  // Date picker styles
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    gap: 10,
  },
  datePickerText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  timePickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  timePickerModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  timePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  timePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  timePickerCancel: {
    fontSize: 16,
    color: '#666',
  },
  timePickerDone: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
  },
  // Weather styles
  weatherContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  weatherInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  weatherButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherHint: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    fontStyle: 'italic',
  },
  switchGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginLeft: 12,
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
    marginLeft: -1,
  },
  toggleButtonActive: {
    backgroundColor: '#4CAF50',
  },
  toggleText: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    marginTop: 8,
  },
  checklistItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  checklistQuestion: {
    fontSize: 13,
    color: '#333',
    marginBottom: 8,
  },
  checklistOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  checklistNotes: {
    fontSize: 13,
    color: '#333',
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#eee',
    marginTop: 8,
    minHeight: 36,
  },
  purposeContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 8,
  },
  purposeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  purposeCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  purposeCheckboxActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  purposeText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  inspectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4CAF50',
    marginBottom: 16,
  },
  inspectionToggleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    flex: 1,
    marginLeft: 12,
  },
  inspectionContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inspectionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  inspectionApproved: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  inspectionPending: {
    borderColor: '#FF9800',
    backgroundColor: '#FFF3E0',
  },
  inspectionReinspection: {
    borderColor: '#F44336',
    backgroundColor: '#FFEBEE',
  },
  inspectionRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  inspectionRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  inspectionOptionText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  pendingSubFields: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  evidenceText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  inspectionDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    gap: 12,
  },
  inspectionDisabledText: {
    fontSize: 14,
    color: '#999',
    flex: 1,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  validateButton: {
    backgroundColor: '#4CAF50',
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionsContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4CAF50',
    marginTop: 8,
    overflow: 'hidden',
  },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    padding: 10,
    backgroundColor: '#e8f5e9',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 8,
  },
  suggestionText: {
    fontSize: 13,
    color: '#333',
    flex: 1,
  },
  dismissSuggestions: {
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  dismissText: {
    fontSize: 13,
    color: '#999',
  },
  validatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  validatedText: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
    flex: 1,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  mapButtonText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  optionButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  optionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  optionTextActive: {
    color: '#fff',
  },
  // Photo styles
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoCount: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 16,
  },
  photoActionButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 6,
  },
  photoGrid: {
    gap: 12,
  },
  photoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  photoImage: {
    width: '100%',
    height: 200,
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  captionContainer: {
    padding: 12,
  },
  photoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
    marginTop: 6,
  },
  photoNameInput: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    padding: 8,
    backgroundColor: '#e8f5e9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  photoCommentInput: {
    fontSize: 13,
    color: '#333',
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  photoNameBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(76,175,80,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  photoNameText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  captionInput: {
    fontSize: 14,
    color: '#333',
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
  },
  noPhotosContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  noPhotosText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  noPhotosSubtext: {
    fontSize: 13,
    color: '#bbb',
    marginTop: 4,
  },
  // Declaration styles
  declarationBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  declarationText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 20,
  },
  signatureSection: {
    marginTop: 8,
  },
  signatureTypeToggle: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  sigTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#4CAF50',
    gap: 6,
  },
  sigTypeButtonActive: {
    backgroundColor: '#4CAF50',
  },
  sigTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4CAF50',
  },
  sigTypeTextActive: {
    color: '#fff',
  },
  signaturePreview: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  typedSignature: {
    fontSize: 28,
    fontStyle: 'italic',
    color: '#1a237e',
    fontFamily: Platform.OS === 'ios' ? 'Snell Roundhand' : 'cursive',
  },
  signaturePadButton: {
    height: 120,
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
  },
  signaturePadText: {
    marginTop: 8,
    fontSize: 14,
    color: '#4CAF50',
  },
  signatureAdded: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '500',
  },
  navButtonTextDisabled: {
    color: '#ccc',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 4,
  },
  nextButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 6,
  },
  submitButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  signatureModal: {
    flex: 1,
    backgroundColor: '#fff',
  },
  signatureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  signatureModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  clearText: {
    fontSize: 16,
    color: '#F44336',
  },
  signatureCanvasContainer: {
    flex: 1,
    margin: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  signatureModalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  signatureSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  signatureSaveText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  // Picker styles
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    gap: 10,
  },
  pickerButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  pickerButtonPlaceholder: {
    color: '#999',
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  pickerList: {
    maxHeight: 300,
    padding: 16,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  jobNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  jobName: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  emptyListText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  addNewSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#f9f9f9',
  },
  addNewLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  addNewRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addNewInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  addNewButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerDoneButton: {
    margin: 16,
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  pickerDoneText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
