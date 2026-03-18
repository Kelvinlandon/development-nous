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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
  process.env.EXPO_PUBLIC_BACKEND_URL || 
  'https://form-emailer-3.preview.emergentagent.com';

interface Settings {
  default_recipient_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_use_tls: boolean;
  smtp_enabled: boolean;
  company_name: string;
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>({
    default_recipient_email: 'kelvin.landon@developmentnous.nz',
    smtp_host: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    smtp_use_tls: true,
    smtp_enabled: false,
    company_name: 'Development Nous Limited',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#1976D2" />
            <Text style={styles.infoText}>
              For Gmail, use an App Password instead of your regular password.
              Enable 2FA and generate an App Password in Google Account settings.
            </Text>
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
});
