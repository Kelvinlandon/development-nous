import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
  process.env.EXPO_PUBLIC_BACKEND_URL || 
  'https://safetypaws-reports.preview.emergentagent.com';

interface Settings {
  default_recipient_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_use_tls: boolean;
  smtp_enabled: boolean;
  company_name: string;
  staff_csv_url: string;
  jobs_csv_url: string;
  report_frequency: string;
  report_recipient_email: string;
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>({
    default_recipient_email: 'kelvin.landon@developmentnous.nz',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    smtp_use_tls: true,
    smtp_enabled: false,
    company_name: 'Development Nous Limited',
    staff_csv_url: 'https://docs.google.com/spreadsheets/d/1IXIYNCBUyP1OHn5sjci-sn2DWq_x1XJiMvgq1YfKz9Y/edit?gid=0#gid=0',
    jobs_csv_url: 'https://docs.google.com/spreadsheets/d/1xIpraMOCkGG4MUC3CnQ6o7BhyDbHZ0JzKobt7YlPQgw/edit?gid=0#gid=0',
    report_frequency: 'manual',
    report_recipient_email: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/settings`);
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/settings`, settings);
      Alert.alert('Success', 'Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const syncFromCSV = async () => {
    if (!settings.staff_csv_url && !settings.jobs_csv_url) {
      Alert.alert('No URLs', 'Please enter at least one CSV URL before syncing');
      return;
    }
    
    setSyncing(true);
    try {
      // First save settings to ensure URLs are stored
      await axios.put(`${API_URL}/api/settings`, settings);
      
      // Then trigger sync
      const response = await axios.post(`${API_URL}/api/sync`);
      
      if (response.data.success) {
        Alert.alert(
          'Sync Complete', 
          `Synced ${response.data.staff_count} staff members and ${response.data.jobs_count} jobs`
        );
      } else {
        Alert.alert('Sync Issue', response.data.message);
      }
    } catch (error) {
      console.error('Error syncing:', error);
      Alert.alert('Error', 'Failed to sync from CSV');
    } finally {
      setSyncing(false);
    }
  };

  const sendSpreadsheetReport = async () => {
    setSendingReport(true);
    try {
      const recipient = settings.report_recipient_email || settings.default_recipient_email;
      const response = await axios.post(`${API_URL}/api/reports/spreadsheet-email?recipient_email=${encodeURIComponent(recipient)}`);
      Alert.alert(response.data.success ? 'Report Sent!' : 'Error', response.data.message);
    } catch (error: any) {
      Alert.alert('Failed', error.response?.data?.detail || 'Failed to send spreadsheet report');
    } finally {
      setSendingReport(false);
    }
  };


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Email Settings */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="mail" size={22} color="#4CAF50" />
              <Text style={styles.sectionTitle}>Email Settings</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Default Recipient Email</Text>
              <TextInput
                style={styles.input}
                value={settings.default_recipient_email}
                onChangeText={(text) =>
                  setSettings({ ...settings, default_recipient_email: text })
                }
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="email@example.com"
              />
              <Text style={styles.hint}>
                Reports will be sent to this email by default
              </Text>
            </View>
          </View>

          {/* SMTP Settings */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="server" size={22} color="#4CAF50" />
              <Text style={styles.sectionTitle}>SMTP Configuration</Text>
            </View>

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Enable SMTP</Text>
                <Text style={styles.hint}>
                  {settings.smtp_enabled ? 'Real emails will be sent' : 'Emails are mocked'}
                </Text>
              </View>
              <Switch
                value={settings.smtp_enabled}
                onValueChange={(value) =>
                  setSettings({ ...settings, smtp_enabled: value })
                }
                trackColor={{ false: '#ddd', true: '#81C784' }}
                thumbColor={settings.smtp_enabled ? '#4CAF50' : '#f4f3f4'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>SMTP Host</Text>
              <TextInput
                style={styles.input}
                value={settings.smtp_host}
                onChangeText={(text) =>
                  setSettings({ ...settings, smtp_host: text })
                }
                placeholder="smtp.gmail.com"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>SMTP Port</Text>
              <TextInput
                style={styles.input}
                value={settings.smtp_port.toString()}
                onChangeText={(text) =>
                  setSettings({ ...settings, smtp_port: parseInt(text) || 587 })
                }
                keyboardType="numeric"
                placeholder="587"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={settings.smtp_username}
                onChangeText={(text) =>
                  setSettings({ ...settings, smtp_username: text })
                }
                autoCapitalize="none"
                placeholder="your-email@gmail.com"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={settings.smtp_password}
                  onChangeText={(text) =>
                    setSettings({ ...settings, smtp_password: text })
                  }
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  placeholder="App password"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={22}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Use TLS</Text>
              <Switch
                value={settings.smtp_use_tls}
                onValueChange={(value) =>
                  setSettings({ ...settings, smtp_use_tls: value })
                }
                trackColor={{ false: '#ddd', true: '#81C784' }}
                thumbColor={settings.smtp_use_tls ? '#4CAF50' : '#f4f3f4'}
              />
            </View>
          </View>

          {/* Company Settings */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="business" size={22} color="#4CAF50" />
              <Text style={styles.sectionTitle}>Company</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Company Name</Text>
              <TextInput
                style={styles.input}
                value={settings.company_name}
                onChangeText={(text) =>
                  setSettings({ ...settings, company_name: text })
                }
                placeholder="Company Name"
              />
            </View>
          </View>

          {/* External Data Sync */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cloud-download" size={22} color="#4CAF50" />
              <Text style={styles.sectionTitle}>External Data Sync</Text>
            </View>
            
            <Text style={styles.syncDescription}>
              Sync staff and jobs from a Google Sheets spreadsheet. Just paste the share link — no special export needed.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Staff Spreadsheet URL</Text>
              <TextInput
                style={styles.input}
                value={settings.staff_csv_url}
                onChangeText={(text) =>
                  setSettings({ ...settings, staff_csv_url: text })
                }
                placeholder="https://docs.google.com/spreadsheets/d/..."
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.hint}>
                First column should contain staff names
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Jobs Spreadsheet URL</Text>
              <TextInput
                style={styles.input}
                value={settings.jobs_csv_url}
                onChangeText={(text) =>
                  setSettings({ ...settings, jobs_csv_url: text })
                }
                placeholder="https://docs.google.com/spreadsheets/d/..."
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.hint}>
                Column A = Job Number, Column B = Job Name
              </Text>
            </View>

            <TouchableOpacity
              style={styles.syncButton}
              onPress={syncFromCSV}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="sync" size={20} color="#fff" />
                  <Text style={styles.syncButtonText}>Sync Now</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Google Sheets Instructions */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#1976D2" />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoText}>
                <Text style={{ fontWeight: '700' }}>Google Sheets Setup:{'\n\n'}</Text>
                <Text style={{ fontWeight: '600' }}>Staff spreadsheet:{'\n'}</Text>
                {'  '}Column A header: "Name"{'\n'}
                {'  '}Then list each person's name in the rows below{'\n\n'}
                <Text style={{ fontWeight: '600' }}>Jobs spreadsheet:{'\n'}</Text>
                {'  '}Column A header: "Job Number"{'\n'}
                {'  '}Column B header: "Job Name"{'\n'}
                {'  '}Column C header: "Address"{'\n'}
                {'  '}Then list each job in the rows below{'\n\n'}
                <Text style={{ fontWeight: '600' }}>IMPORTANT:{'\n'}</Text>
                {'  '}1. Click Share → "Anyone with the link" → Viewer{'\n'}
                {'  '}2. Copy the link and paste it above{'\n'}
                {'  '}3. Hit Save Settings, then Sync Now
              </Text>
            </View>
          </View>

          {/* SMTP Info Box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#1976D2" />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoText}>
                <Text style={{ fontWeight: '600' }}>Gmail Setup:{'\n'}</Text>
                1. Go to myaccount.google.com → Security{'\n'}
                2. Enable 2-Step Verification{'\n'}
                3. Search for "App passwords" in Security{'\n'}
                4. Create a new app password for "Mail"{'\n'}
                5. Use your Gmail as Username and the 16-character app password as Password above{'\n'}
                6. Host: smtp.gmail.com, Port: 587, TLS: On
              </Text>
            </View>
          </View>

          {/* Spreadsheet Report Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="stats-chart" size={22} color="#4CAF50" />
              <Text style={styles.sectionTitle}>Spreadsheet Reports</Text>
            </View>
            
            <Text style={styles.syncDescription}>
              Generate a CSV spreadsheet of all site visit data and email it automatically.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Report Recipient Email</Text>
              <TextInput
                style={styles.input}
                value={settings.report_recipient_email}
                onChangeText={(text) =>
                  setSettings({ ...settings, report_recipient_email: text })
                }
                placeholder="Uses default email if empty"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Auto-Send Frequency</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['manual', 'daily', 'weekly', 'monthly'].map((freq) => (
                  <TouchableOpacity
                    key={freq}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      borderWidth: 2,
                      borderColor: settings.report_frequency === freq ? '#4CAF50' : '#ddd',
                      backgroundColor: settings.report_frequency === freq ? '#E8F5E9' : '#fff',
                    }}
                    onPress={() => setSettings({ ...settings, report_frequency: freq })}
                  >
                    <Text style={{
                      fontSize: 14,
                      fontWeight: settings.report_frequency === freq ? '700' : '400',
                      color: settings.report_frequency === freq ? '#2E7D32' : '#666',
                    }}>
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>
                {settings.report_frequency === 'manual' ? 'Use the button below to send manually' :
                 `Report will be sent ${settings.report_frequency} automatically`}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.syncButton, { backgroundColor: '#2196F3' }]}
              onPress={sendSpreadsheetReport}
              disabled={sendingReport}
            >
              {sendingReport ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="document-text" size={20} color="#fff" />
                  <Text style={styles.syncButtonText}>Send Report Now</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Save Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveSettings}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Save Settings</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
  scrollView: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
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
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  hint: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 15,
  },
  eyeButton: {
    padding: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1976D2',
    lineHeight: 18,
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  syncDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
