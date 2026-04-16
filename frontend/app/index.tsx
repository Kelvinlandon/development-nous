import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
  process.env.EXPO_PUBLIC_BACKEND_URL || 
  'https://site-report-app-4.preview.emergentagent.com';

interface Report {
  id: string;
  job_no_name: string;
  date: string;
  staff_members: string;
  site_description: string;
  email_sent: boolean;
  created_at: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReports = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/reports`);
      setReports(response.data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchReports();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchReports();
  };

  const renderReportItem = ({ item }: { item: Report }) => (
    <TouchableOpacity
      style={styles.reportCard}
      onPress={() => router.push(`/reports/${item.id}`)}
    >
      <View style={styles.reportHeader}>
        <Text style={styles.reportTitle}>{item.job_no_name}</Text>
        {item.email_sent && (
          <Ionicons name="mail" size={18} color="#4CAF50" />
        )}
      </View>
      <Text style={styles.reportDate}>{item.date}</Text>
      <Text style={styles.reportStaff}>{item.staff_members}</Text>
      <Text style={styles.reportDescription} numberOfLines={2}>
        {item.site_description}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Logo Header */}
      <View style={styles.logoContainer}>
        <View style={styles.headerRow}>
          {/* App Icon on Left */}
          <Image
            source={{ uri: 'https://customer-assets.emergentagent.com/job_form-emailer-3/artifacts/ndpaetfg_harry%20ute%20icon.png' }}
            style={styles.appIcon}
            resizeMode="contain"
          />
          
          {/* Center Logo */}
          <View style={styles.centerLogo}>
            <Image
              source={{ uri: 'https://customer-assets.emergentagent.com/job_form-emailer-3/artifacts/7zxptafs_DNL_Logo_Secondary.png' }}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          
          {/* Office Dog on Right */}
          <Image
            source={{ uri: 'https://customer-assets.emergentagent.com/job_form-emailer-3/artifacts/zb41p2id_Designer%20%285%29.png' }}
            style={styles.dogIcon}
            resizeMode="contain"
          />
        </View>
        
        {/* Tagline */}
        <View style={styles.taglineContainer}>
          <Text style={styles.taglineMain}>Take ya time and Paws for safety!</Text>
          <Text style={styles.taglineSub}>NOTE: A report must be completed for all site visits. Harry must be given a treat and a pat prior to all site visits</Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/form')}
        >
          <Ionicons name="add-circle" size={24} color="#fff" />
          <Text style={styles.primaryButtonText}>New Site Visit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/settings')}
        >
          <Ionicons name="settings" size={24} color="#4CAF50" />
        </TouchableOpacity>
      </View>

      {/* Reports List */}
      <View style={styles.reportsContainer}>
        <Text style={styles.sectionTitle}>Recent Reports</Text>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
          </View>
        ) : reports.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="document-text-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No reports yet</Text>
            <Text style={styles.emptySubtext}>
              Create your first site visit report
            </Text>
          </View>
        ) : (
          <FlatList
            data={reports}
            keyExtractor={(item) => item.id}
            renderItem={renderReportItem}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  logoContainer: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#1a1a1a',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appIcon: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  centerLogo: {
    flex: 1,
    alignItems: 'center',
  },
  logo: {
    width: 130,
    height: 45,
  },
  dogIcon: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  taglineContainer: {
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  taglineMain: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  taglineSub: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
  companyName: {
    color: '#4CAF50',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  reportsContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  listContent: {
    paddingBottom: 20,
  },
  reportCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  reportDate: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
    marginBottom: 4,
  },
  reportStaff: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  reportDescription: {
    fontSize: 12,
    color: '#999',
  },
});
