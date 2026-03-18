import React, { useState, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import SignatureCanvas from 'react-native-signature-canvas';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
  process.env.EXPO_PUBLIC_BACKEND_URL || 
  'https://form-emailer-3.preview.emergentagent.com';

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

interface ChecklistItem {
  question: string;
  answer: string | null;
  notes: string;
}

interface FormData {
  // Header
  staff_members: string;
  date: string;
  job_no_name: string;
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
  
  const today = new Date().toISOString().split('T')[0];
  
  const [formData, setFormData] = useState<FormData>({
    staff_members: '',
    date: today,
    job_no_name: '',
    site_arrival_time: '',
    site_departure_time: '',
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
    staff_print_name: '',
    signature_data: '',
    signature_type: 'typed',
    declaration_date: today,
  });

  const steps = ['Site Info', 'Hazards', 'Safety', 'Declare'];

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

  const validateStep = (): boolean => {
    switch (currentStep) {
      case 0:
        if (!formData.staff_members || !formData.date || !formData.job_no_name) {
          Alert.alert('Required Fields', 'Please fill in Staff Member(s), Date, and Job No./Name');
          return false;
        }
        break;
      case 3:
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
      const response = await axios.post(`${API_URL}/api/reports`, formData);
      Alert.alert(
        'Success',
        'Report created successfully. Would you like to send it via email?',
        [
          { text: 'Later', onPress: () => router.replace('/') },
          {
            text: 'Send Email',
            onPress: async () => {
              try {
                await axios.post(`${API_URL}/api/reports/${response.data.id}/email`, {
                  report_id: response.data.id
                });
                Alert.alert('Email Sent', 'Report has been emailed successfully');
                router.replace('/');
              } catch (error) {
                Alert.alert('Email Failed', 'Report saved but email failed to send');
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
        <View key={step} style={styles.stepItem}>
          <View style={[
            styles.stepCircle,
            index === currentStep && styles.stepCircleActive,
            index < currentStep && styles.stepCircleCompleted,
          ]}>
            {index < currentStep ? (
              <Ionicons name="checkmark" size={14} color="#fff" />
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
        </View>
      ))}
    </View>
  );

  const renderSiteInfoStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Staff Member(s) *</Text>
        <TextInput
          style={styles.input}
          value={formData.staff_members}
          onChangeText={(text) => updateField('staff_members', text)}
          placeholder="Enter staff names"
        />
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Date *</Text>
          <TextInput
            style={styles.input}
            value={formData.date}
            onChangeText={(text) => updateField('date', text)}
            placeholder="YYYY-MM-DD"
          />
        </View>
        <View style={{ width: 12 }} />
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Job No. / Name *</Text>
          <TextInput
            style={styles.input}
            value={formData.job_no_name}
            onChangeText={(text) => updateField('job_no_name', text)}
            placeholder="Job reference"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Arrival Time</Text>
          <TextInput
            style={styles.input}
            value={formData.site_arrival_time}
            onChangeText={(text) => updateField('site_arrival_time', text)}
            placeholder="HH:MM"
          />
        </View>
        <View style={{ width: 12 }} />
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Departure Time</Text>
          <TextInput
            style={styles.input}
            value={formData.site_departure_time}
            onChangeText={(text) => updateField('site_departure_time', text)}
            placeholder="HH:MM"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Site Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.site_description}
          onChangeText={(text) => updateField('site_description', text)}
          placeholder="Describe the site"
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Weather Conditions</Text>
        <TextInput
          style={styles.input}
          value={formData.weather_conditions}
          onChangeText={(text) => updateField('weather_conditions', text)}
          placeholder="e.g., Sunny, 20°C"
        />
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

  const renderDeclarationStep = () => (
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
        <TextInput
          style={styles.input}
          value={formData.staff_print_name}
          onChangeText={(text) => updateField('staff_print_name', text)}
          placeholder="Your full name"
        />
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

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return renderSiteInfoStep();
      case 1: return renderHazardsStep();
      case 2: return renderSafetyStep();
      case 3: return renderDeclarationStep();
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
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  stepItem: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLabel: {
    fontSize: 11,
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
});
