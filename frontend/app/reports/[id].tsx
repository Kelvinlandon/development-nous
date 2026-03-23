import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
  process.env.EXPO_PUBLIC_BACKEND_URL || 
  'https://site-report-app-4.preview.emergentagent.com';

interface Report {
  id: string;
  staff_members: string;
  date: string;
  job_no_name: string;
  job_address: string;
  purpose_of_visit: string[];
  site_arrival_time: string;
  site_departure_time: string;
  site_description: string;
  weather_conditions: string;
  contractor_responsible: string;
  risks_hazards_incidents: string;
  toolbox_talk_required: boolean;
  toolbox_talk_notes: string;
  checklist_comments: string;
  safety_checklist: Array<{
    question: string;
    answer: string;
    notes: string;
  }>;
  electrical_equipment_list: string;
  site_photos: Array<{
    id: string;
    base64_data: string;
    caption: string;
    timestamp?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
  }>;
  staff_print_name: string;
  signature_type: string;
  declaration_date: string;
  email_sent: boolean;
  email_sent_to: string;
  created_at: string;
}

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [sendingPhotos, setSendingPhotos] = useState(false);
  const [customEmail, setCustomEmail] = useState('');

  useEffect(() => {
    fetchReport();
  }, [id]);

  const fetchReport = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/reports/${id}`);
      setReport(response.data);
    } catch (error) {
      console.error('Error fetching report:', error);
      Alert.alert('Error', 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const response = await axios.get(`${API_URL}/api/reports/${id}/pdf`, {
        timeout: 60000, // 60 second timeout for large PDFs
      });
      const { pdf_base64, filename } = response.data;
      
      if (Platform.OS === 'web') {
        // For web, create a download link
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${pdf_base64}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert('Success', 'PDF downloaded successfully');
      } else {
        // For mobile, save and share
        if (!FileSystem.documentDirectory) {
          Alert.alert('Error', 'File system not available');
          return;
        }
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, pdf_base64, {
          encoding: 'base64' as any,
        });
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Share Report PDF',
          });
        } else {
          Alert.alert('Success', 'PDF saved to documents');
        }
      }
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to download PDF';
      Alert.alert('Error', errorMsg);
    } finally {
      setDownloading(false);
    }
  };

  const sendEmail = async (email?: string) => {
    setSending(true);
    try {
      const response = await axios.post(`${API_URL}/api/reports/${id}/email`, {
        report_id: id,
        recipient_email: email || null,
      });
      
      const message = response.data.mocked 
        ? `Email simulated to ${response.data.recipient}.\n\nTo send real emails, configure Gmail SMTP in Settings.`
        : `Email sent successfully to ${response.data.recipient} with PDF attachment!`;
      
      Alert.alert(response.data.mocked ? 'Simulated' : 'Email Sent!', message);
      setShowEmailModal(false);
      fetchReport(); // Refresh to show email_sent status
    } catch (error: any) {
      console.error('Error sending email:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to send email. Check SMTP settings.';
      Alert.alert('Email Failed', errorMsg);
    } finally {
      setSending(false);
    }
  };

  const sendPhotosEmail = async (email?: string) => {
    if (!report?.site_photos || report.site_photos.length === 0) {
      Alert.alert('No Photos', 'This report has no photos to send.');
      return;
    }
    setSendingPhotos(true);
    try {
      const response = await axios.post(`${API_URL}/api/reports/${id}/email-photos`, {
        report_id: id,
        recipient_email: email || null,
      });
      
      Alert.alert(
        response.data.mocked ? 'Simulated' : 'Photos Sent!',
        response.data.message
      );
      setShowEmailModal(false);
    } catch (error: any) {
      console.error('Error sending photos:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to send photos.';
      Alert.alert('Failed', errorMsg);
    } finally {
      setSendingPhotos(false);
    }
  };

  const deleteReport = () => {
    Alert.alert(
      'Delete Report',
      'Are you sure you want to delete this report?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/reports/${id}`);
              router.replace('/');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete report');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color="#F44336" />
        <Text style={styles.errorText}>Report not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header Info */}
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.jobName}>{report.job_no_name}</Text>
            {report.email_sent && (
              <View style={styles.emailBadge}>
                <Ionicons name="mail" size={14} color="#fff" />
                <Text style={styles.emailBadgeText}>Sent</Text>
              </View>
            )}
          </View>
          <Text style={styles.date}>{report.date}</Text>
        </View>

        {/* Site Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Site Information</Text>
          <InfoRow label="Staff Member(s)" value={report.staff_members} />
          <InfoRow label="Arrival Time" value={report.site_arrival_time} />
          <InfoRow label="Departure Time" value={report.site_departure_time} />
          <InfoRow label="Weather" value={report.weather_conditions} />
          <InfoRow label="Contractor" value={report.contractor_responsible} />
          {report.job_address ? (
            <InfoRow label="Job Address" value={report.job_address} />
          ) : null}
          {report.purpose_of_visit && report.purpose_of_visit.length > 0 && (
            <InfoRow label="Purpose of Visit" value={report.purpose_of_visit.join(', ')} />
          )}
          <InfoRow label="Site Description" value={report.site_description} multiline />
        </View>

        {/* Hazards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hazards & Incidents</Text>
          <InfoRow 
            label="Recorded Issues" 
            value={report.risks_hazards_incidents || 'None reported'} 
            multiline 
          />
          <InfoRow 
            label="Toolbox Talk Required" 
            value={report.toolbox_talk_required ? 'Yes' : 'No'} 
          />
          {report.toolbox_talk_notes && (
            <InfoRow label="Notes" value={report.toolbox_talk_notes} multiline />
          )}
        </View>

        {/* Safety Checklist */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety Checklist</Text>
          {report.checklist_comments && (
            <InfoRow label="Comments" value={report.checklist_comments} multiline />
          )}
          {report.safety_checklist.map((item, index) => (
            <View key={index} style={styles.checklistItem}>
              <Text style={styles.checklistQuestion}>{item.question}</Text>
              <View style={[
                styles.checklistAnswer,
                item.answer === 'yes' && styles.answerYes,
                item.answer === 'no' && styles.answerNo,
                item.answer === 'na' && styles.answerNa,
              ]}>
                <Text style={styles.answerText}>
                  {item.answer?.toUpperCase() || '-'}
                </Text>
              </View>
              {item.notes ? (
                <Text style={styles.checklistNotes}>{item.notes}</Text>
              ) : null}
            </View>
          ))}
          {report.electrical_equipment_list && (
            <InfoRow label="Electrical Equipment" value={report.electrical_equipment_list} />
          )}
        </View>

        {/* Declaration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Declaration</Text>
          <InfoRow label="Signed By" value={report.staff_print_name} />
          <InfoRow label="Signature Type" value={report.signature_type === 'drawn' ? 'Drawn' : 'Typed'} />
          <InfoRow label="Date" value={report.declaration_date} />
        </View>

        {/* Site Photos */}
        {report.site_photos && report.site_photos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Site Photos ({report.site_photos.length})</Text>
            {report.site_photos.map((photo, index) => (
              <View key={photo.id || index} style={styles.photoContainer}>
                <Image
                  source={{ uri: photo.base64_data }}
                  style={styles.reportPhoto}
                  resizeMode="cover"
                />
                <View style={styles.photoMetadata}>
                  {photo.caption && (
                    <Text style={styles.photoCaption}>{photo.caption}</Text>
                  )}
                  {photo.timestamp && (
                    <View style={styles.metadataRow}>
                      <Ionicons name="time-outline" size={12} color="#888" />
                      <Text style={styles.metadataText}>
                        {new Date(photo.timestamp).toLocaleString('en-NZ')}
                      </Text>
                    </View>
                  )}
                  {photo.address ? (
                    <View style={styles.metadataRow}>
                      <Ionicons name="location-outline" size={12} color="#888" />
                      <Text style={styles.metadataText}>{photo.address}</Text>
                    </View>
                  ) : photo.latitude && photo.longitude ? (
                    <View style={styles.metadataRow}>
                      <Ionicons name="navigate-outline" size={12} color="#888" />
                      <Text style={styles.metadataText}>
                        GPS: {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Email Status */}
        {report.email_sent && (
          <View style={styles.emailStatus}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.emailStatusText}>
              Emailed to: {report.email_sent_to}
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={deleteReport}
        >
          <Ionicons name="trash" size={20} color="#F44336" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.pdfButton}
          onPress={downloadPDF}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator size="small" color="#4CAF50" />
          ) : (
            <>
              <Ionicons name="document" size={20} color="#4CAF50" />
              <Text style={styles.pdfButtonText}>PDF</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.emailButton}
          onPress={() => setShowEmailModal(true)}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="mail" size={20} color="#fff" />
              <Text style={styles.emailButtonText}>Send Email</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Email Modal */}
      <Modal
        visible={showEmailModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEmailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Email Options</Text>
            
            <TouchableOpacity
              style={styles.emailOption}
              onPress={() => sendEmail()}
              disabled={sending}
            >
              <Ionicons name="document-text" size={24} color="#4CAF50" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.emailOptionTitle}>Send Report + PDF</Text>
                <Text style={styles.emailOptionSubtitle}>Email report with PDF attachment</Text>
              </View>
              {sending ? <ActivityIndicator size="small" color="#4CAF50" /> : <Ionicons name="chevron-forward" size={20} color="#ccc" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emailOption}
              onPress={() => sendPhotosEmail()}
              disabled={sendingPhotos || !report?.site_photos?.length}
            >
              <Ionicons name="images" size={24} color="#2196F3" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.emailOptionTitle}>Send Photos</Text>
                <Text style={styles.emailOptionSubtitle}>
                  {report?.site_photos?.length ? `${report.site_photos.length} photo(s) as attachments` : 'No photos available'}
                </Text>
              </View>
              {sendingPhotos ? <ActivityIndicator size="small" color="#2196F3" /> : <Ionicons name="chevron-forward" size={20} color="#ccc" />}
            </TouchableOpacity>

            <View style={styles.divider} />
            
            <Text style={styles.customEmailLabel}>Or send to custom email:</Text>
            <TextInput
              style={styles.emailInput}
              value={customEmail}
              onChangeText={setCustomEmail}
              placeholder="email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[
                  styles.sendCustomButton,
                  { flex: 1, backgroundColor: '#4CAF50' },
                  !customEmail && styles.sendCustomButtonDisabled,
                ]}
                onPress={() => sendEmail(customEmail)}
                disabled={!customEmail || sending}
              >
                <Text style={styles.sendCustomButtonText}>Report</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sendCustomButton,
                  { flex: 1, backgroundColor: '#2196F3' },
                  (!customEmail || !report?.site_photos?.length) && styles.sendCustomButtonDisabled,
                ]}
                onPress={() => sendPhotosEmail(customEmail)}
                disabled={!customEmail || sendingPhotos || !report?.site_photos?.length}
              >
                <Text style={styles.sendCustomButtonText}>Photos</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowEmailModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const InfoRow = ({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) => (
  <View style={[styles.infoRow, multiline && styles.infoRowMultiline]}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, multiline && styles.infoValueMultiline]}>
      {value || '-'}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jobName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  emailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  emailBadgeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  date: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoRowMultiline: {
    flexDirection: 'column',
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
    width: 120,
  },
  infoValue: {
    fontSize: 13,
    color: '#333',
    flex: 1,
  },
  infoValueMultiline: {
    marginTop: 4,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexWrap: 'wrap',
  },
  checklistQuestion: {
    flex: 1,
    fontSize: 12,
    color: '#333',
  },
  checklistNotes: {
    width: '100%',
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
    backgroundColor: '#f9f9f9',
    padding: 6,
    borderRadius: 4,
    marginTop: 4,
  },
  checklistAnswer: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#eee',
  },
  answerYes: {
    backgroundColor: '#E8F5E9',
  },
  answerNo: {
    backgroundColor: '#FFEBEE',
  },
  answerNa: {
    backgroundColor: '#FFF3E0',
  },
  answerText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emailStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  emailStatusText: {
    fontSize: 13,
    color: '#333',
  },
  photoContainer: {
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f9f9f9',
  },
  reportPhoto: {
    width: '100%',
    height: 220,
  },
  photoMetadata: {
    padding: 10,
    backgroundColor: '#f5f5f5',
  },
  photoCaption: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    marginBottom: 6,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  metadataText: {
    fontSize: 11,
    color: '#666',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 12,
  },
  deleteButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F44336',
    borderRadius: 8,
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 8,
    gap: 6,
  },
  pdfButtonText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  emailButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    height: 48,
    borderRadius: 8,
    gap: 6,
  },
  emailButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  emailOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  emailOptionTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  emailOptionSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 16,
  },
  customEmailLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  sendCustomButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendCustomButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendCustomButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
});
