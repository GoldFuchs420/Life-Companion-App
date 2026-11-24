import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>LifeCompanion</Text>
      <Text style={styles.hint}>Hauptmenü folgt in M2.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#121212' },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  hint: { color: '#9E9E9E', marginTop: 8 },
});
