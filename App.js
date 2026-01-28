import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Button, SafeAreaView, Alert, ActivityIndicator, ScrollView } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import axios from 'axios';

const SERVER_URL = 'https://x-media-server.onrender.com';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [username, setUsername] = useState('');
  const [cookiesInput, setCookiesInput] = useState('');
  const [savedCookies, setSavedCookies] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [mediaUrls, setMediaUrls] = useState([]);

  useEffect(() => {
    const loadCookies = async () => {
      try {
        const stored = await SecureStore.getItemAsync('x_auth_cookies');
        if (stored) setSavedCookies(stored);
      } catch (error) {
        console.log('Load error:', error);
      }
    };
    loadCookies();
  }, []);

  const goToCookiesScreen = () => setCurrentScreen('cookies');
  const goBackToHome = () => setCurrentScreen('home');

  const saveCookies = async () => {
    if (!cookiesInput.trim()) {
      Alert.alert('Error', 'Paste something first');
      return;
    }
    try {
      await SecureStore.setItemAsync('x_auth_cookies', cookiesInput.trim());
      setSavedCookies(cookiesInput.trim());
      Alert.alert('Success', 'Cookies saved');
      setCookiesInput('');
      goBackToHome();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const getMediaLinks = async () => {
    if (!username.trim() || !savedCookies) {
      Alert.alert('Error', 'Enter username and save cookies first');
      return;
    }

    setLoading(true);
    setStatus('Connecting to server...');
    setMediaUrls([]);

    try {
      const response = await axios.post(`${SERVER_URL}/get-media-urls`, {
        username: username.trim(),
        cookies: savedCookies,
      });

      const { urls, count } = response.data;
      if (!urls || urls.length === 0) {
        setStatus('No media URLs found');
        return;
      }

      setMediaUrls(urls);
      setStatus(`Success! Found ${count} media items.\n\nFirst 5:\n${urls.slice(0, 5).join('\n')}\n...and ${count - 5} more.`);
    } catch (error) {
      setStatus('Error: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const checkAndRequestPermission = async () => {
    const perm = await MediaLibrary.getPermissionsAsync();
    setStatus(`Permission status: ${perm.status}`);

    if (perm.status === 'granted') {
      return true;
    }

    if (perm.status === 'denied' && !perm.canAskAgain) {
      setStatus('Permission denied permanently. Go to Settings > App > Photos > Allow');
      Alert.alert('Permission Needed', 'Go to phone Settings and allow Photos access for this app.');
      return false;
    }

    const { status } = await MediaLibrary.requestPermissionsAsync();
    setStatus(`After request: ${status}`);

    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Cannot save to gallery without access. Enable in Settings.');
      return false;
    }

    return true;
  };

  const downloadFirst10 = async () => {
    if (mediaUrls.length === 0) {
      Alert.alert('No links', 'First get media links');
      return;
    }

    setLoading(true);
    setStatus('Checking permission...');

    const hasPermission = await checkAndRequestPermission();

    if (!hasPermission) {
      setLoading(false);
      return;
    }

    const urlsToDownload = mediaUrls.slice(0, 10);
    setStatus(`Starting download of first 10 items...`);

    let success = 0;
    let fail = 0;

    for (let i = 0; i < urlsToDownload.length; i++) {
      const url = urlsToDownload[i];
      setStatus(`Downloading ${i + 1}/10... Success: ${success} | Fail: ${fail}`);

      try {
        const ext = url.split('.').pop().split('?')[0] || 'jpg';
        const fileUri = `${FileSystem.documentDirectory}${username.trim()}_test_${i}.${ext}`;
        const { uri } = await FileSystem.downloadAsync(url, fileUri);

        // Try to save to gallery (may be limited in Expo Go)
        try {
          await MediaLibrary.saveToLibraryAsync(uri);
          success++;
        } catch (saveErr) {
          console.log('Gallery save skipped (Expo Go/Android limit):', saveErr);
          fail++;
        }
      } catch (err) {
        console.log('Download fail:', err);
        fail++;
      }
    }

    setStatus(`Test complete!\nSuccess: ${success}/10\nFailed: ${fail}\n\nFiles saved to app storage. In Expo Go on Android, check with file manager (Internal Storage → Android → data → host.exp.exponent → files).`);
    Alert.alert('Test Done', `Processed ${success} of 10 items. Check storage or make dev build for gallery view.`);
    setLoading(false);
  };

  if (currentScreen === 'cookies') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Paste Cookies</Text>
        <TextInput
          style={[styles.input, { height: 120 }]}
          placeholder="auth_token=...; ct0=..."
          value={cookiesInput}
          onChangeText={setCookiesInput}
          multiline
          autoCapitalize="none"
        />
        <Button title="Save" onPress={saveCookies} />
        <Button title="Back" onPress={goBackToHome} color="gray" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>X Media Downloader - Test Mode</Text>

      <Text style={styles.label}>Username (no @)</Text>
      <TextInput
        style={styles.input}
        placeholder="Grok"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <View style={{ marginVertical: 10 }}>
        <Button title="Get Media Links" onPress={getMediaLinks} disabled={loading} color="blue" />
      </View>

      {mediaUrls.length > 0 && (
        <View style={{ marginVertical: 10 }}>
          <Button title="Download First 10 Only (Test)" onPress={downloadFirst10} disabled={loading} color="green" />
        </View>
      )}

      {loading && <ActivityIndicator size="large" color="blue" style={{ margin: 20 }} />}

      {status && (
        <ScrollView style={{ maxHeight: 400, marginTop: 20 }}>
          <Text style={styles.status}>{status}</Text>
        </ScrollView>
      )}

      <Button title="Set Up Cookies" onPress={goToCookiesScreen} color="orange" style={{ marginTop: 40 }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 16, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 20 },
  status: { fontSize: 16, color: 'green', textAlign: 'center' },
});