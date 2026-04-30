import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState, useEffect, useRef } from 'react';
import { View, Image, Animated, StyleSheet, Dimensions, ActivityIndicator, Text } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    // Scale in
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();

    // After 2.5s, fade out splash
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setShowSplash(false);
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <View style={splashStyles.container}>
        <StatusBar style="light" />
        <Animated.View style={[splashStyles.imageContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Image
            source={require('../assets/splash_image.png')}
            style={splashStyles.image}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    );
  }

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

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#87CEEB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width * 0.9,
    height: height * 0.9,
  },
});
