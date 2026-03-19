import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#4CAF50',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'SafetyPaws',
          }}
        />
        <Stack.Screen
          name="form/index"
          options={{
            title: 'New Report',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
          }}
        />
        <Stack.Screen
          name="reports/[id]"
          options={{
            title: 'Report Details',
          }}
        />
      </Stack>
    </>
  );
}
