import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, Switch, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { apiPostMultipartAuth } from '../../api/client';
import { getUploadableImageUri } from '../../utils/imageUpload';
import { ChevronLeft } from 'lucide-react-native';

export default function RegisterFieldScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [surfaceType, setSurfaceType] = useState('');
  const [size, setSize] = useState('');
  const [pricePerHour, setPricePerHour] = useState('');
  const [hasLights, setHasLights] = useState(false);
  const [description, setDescription] = useState('');
  const [pickedImages, setPickedImages] = useState<Array<{ uri: string; name: string; type: string }>>([]);
  const [step, setStep] = useState(1 as 1 | 2 | 3);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => name.trim().length > 0 && pickedImages.length >= 1 && pickedImages.length <= 3 && !!token, [name, pickedImages, token]);

  const pickImage = async () => {
    if (pickedImages.length >= 3) {
      Alert.alert('Limit reached', 'You can upload up to 3 images.');
      return;
    }
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photo access needed', 'To add photos of your field for your listing, allow photo access. You can enable it in Settings if you change your mind.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });
      if (!result.canceled && Array.isArray(result.assets) && result.assets.length > 0 && result.assets[0] && result.assets[0].uri) {
        const a = result.assets[0] as { uri: string; fileName?: string; mimeType?: string };
        const uri = a.uri;
        const fileName = a.fileName || uri.split('/').pop()?.split('?')[0] || `field_${Date.now()}.jpg`;
        const mimeType = a.mimeType || 'image/jpeg';
        setPickedImages((imgs) => {
          const next = [...imgs, { uri, name: fileName, type: mimeType }];
          return next.slice(0, 3);
        });
      }
    } catch (e: any) {
      Alert.alert('Could not open gallery', e?.message || 'Failed to pick an image. Try again.');
    }
  };

  const removeImageAt = (index: number) => {
    setPickedImages((imgs) => imgs.filter((_, i) => i !== index));
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    try {
      setSubmitting(true);
      const form = new FormData();
      form.append('ownerId', String(user?.id || ''));
      form.append('name', name.trim());
      if (city.trim()) form.append('city', city.trim());
      if (address.trim()) form.append('address', address.trim());
      if (phone.trim()) form.append('phone', phone.trim());
      if (surfaceType.trim()) form.append('surfaceType', surfaceType.trim());
      if (size.trim()) form.append('size', size.trim());
      if (pricePerHour) form.append('pricePerHour', String(Number(pricePerHour)));
      form.append('hasLights', String(hasLights));
      if (description.trim()) form.append('description', description.trim());
      for (const img of pickedImages) {
        const uploadUri = await getUploadableImageUri(img.uri);
        form.append('images', {
          uri: uploadUri as any,
          name: img.name,
          type: img.type,
        } as any);
      }
      await apiPostMultipartAuth<{ id: string }>(`/fields/kyc`, form, token as string);
      Alert.alert('Submitted', 'Your field application was submitted for approval.');
      setName('');
      setCity('');
      setAddress('');
      setPhone('');
      setSurfaceType('');
      setSize('');
      setPricePerHour('');
      setHasLights(false);
      setDescription('');
      setPickedImages([]);
      setStep(1);
      // Redirect to My Fields listing after successful submission
      navigation.replace('MyFields');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safeTop} edges={["top"]}>
        <StatusBar style="light" backgroundColor="#16a34a" />
        <View style={styles.headerBar}>
          {step === 1 ? (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <ChevronLeft size={22} color="#ffffff" />
            </TouchableOpacity>
          ) : null}
          <Text style={styles.headerTitle}>Register Your Field</Text>
          <Text style={styles.headerSubtitle}>Submit details for admin approval</Text>
        </View>
        <View style={styles.stepper}>
          {[1,2,3].map((s) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepCircle, step === s && styles.stepCircleActive]}>
                <Text style={[styles.stepNumber, step === s && styles.stepNumberActive]}>{s}</Text>
              </View>
              {s < 3 ? <View style={[styles.stepLine, step > s && styles.stepLineActive]} /> : null}
            </View>
          ))}
        </View>
      </SafeAreaView>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.stepScreen}>
          {step === 1 && (
            <View>
              <View style={styles.stepHeader}>
                <Text style={styles.stepTitle}>Basic Info</Text>
                <Text style={styles.stepSubtitle}>Tell us about your field</Text>
              </View>
              <Text style={styles.label}>Field Name *</Text>
              <TextInput value={name} onChangeText={setName} placeholder="e.g., Green Park 7-a-side" style={styles.input} />

              <Text style={styles.label}>City</Text>
              <TextInput value={city} onChangeText={setCity} placeholder="e.g., San Francisco" style={styles.input} />

              <Text style={styles.label}>Address</Text>
              <TextInput value={address} onChangeText={setAddress} placeholder="Street, neighborhood" style={styles.input} />
            </View>
          )}

          {step === 2 && (
            <View>
              <View style={styles.stepHeader}>
                <Text style={styles.stepTitle}>Details</Text>
                <Text style={styles.stepSubtitle}>Amenities and pricing</Text>
              </View>
              <Text style={styles.label}>Contact Phone</Text>
              <TextInput value={phone} onChangeText={setPhone} placeholder="e.g., +1 555 123 4567" style={styles.input} keyboardType="phone-pad" />

              <Text style={styles.label}>Surface Type</Text>
              <TextInput value={surfaceType} onChangeText={setSurfaceType} placeholder="e.g., Artificial turf" style={styles.input} />

              <Text style={styles.label}>Field Size</Text>
              <TextInput value={size} onChangeText={setSize} placeholder="e.g., 7-a-side" style={styles.input} />

              <Text style={styles.label}>Price per hour (GMD)</Text>
              <TextInput value={pricePerHour} onChangeText={setPricePerHour} placeholder="e.g., 60" style={styles.input} keyboardType="decimal-pad" />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Has lights</Text>
                <Switch value={hasLights} onValueChange={setHasLights} />
              </View>

              <Text style={styles.label}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Facilities, parking, rules, anything important..."
                style={[styles.input, styles.textarea]}
                multiline
                numberOfLines={4}
              />
            </View>
          )}

          {step === 3 && (
            <View>
              <View style={styles.stepHeader}>
                <Text style={styles.stepTitle}>Photos</Text>
                <Text style={styles.stepSubtitle}>Add 1 to 3 clear images of the field</Text>
              </View>
              <Text style={styles.label}>Field Images *</Text>
              <View style={styles.imagesRow}>
                {pickedImages.map((img, idx) => (
                  <View key={`${img.uri}-${idx}`} style={styles.imageItem}>
                    <Image source={{ uri: img.uri }} style={styles.previewThumb} />
                    <TouchableOpacity onPress={() => removeImageAt(idx)} style={styles.removeBadge}>
                      <Text style={styles.removeBadgeText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {pickedImages.length < 3 && (
                  <TouchableOpacity onPress={pickImage} style={styles.addThumb}>
                    <Text style={styles.addThumbText}>+</Text>
                  </TouchableOpacity>
                )}
              </View>
              {pickedImages.length === 0 ? (
                <TouchableOpacity onPress={pickImage} style={styles.imagePickerButton}>
                  <Text style={styles.imagePickerText}>Add Image</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          <View style={styles.navRow}>
            <TouchableOpacity disabled={step === 1 || submitting} onPress={() => setStep((s) => (Math.max(1, (s as number) - 1) as any))} style={[styles.navButton, (step === 1 || submitting) && styles.navDisabled]}>
              <Text style={styles.navText}>Back</Text>
            </TouchableOpacity>
            {step < 3 ? (
              <TouchableOpacity disabled={(step === 1 && !name.trim()) || submitting} onPress={() => setStep((s) => (Math.min(3, (s as number) + 1) as any))} style={[styles.navButtonPrimary, ((step === 1 && !name.trim()) || submitting) && styles.submitDisabled]}>
                <Text style={styles.navTextPrimary}>Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity disabled={!canSubmit || submitting} onPress={onSubmit} style={[styles.navButtonPrimary, (!canSubmit || submitting) && styles.navDisabled]}>
                <Text style={styles.navTextPrimary}>{submitting ? 'Submitting...' : 'Submit'}</Text>
              </TouchableOpacity>
            )}
          </View>
          {step === 2 ? <View style={styles.afterButtonSpacer} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safeTop: {
    backgroundColor: '#16a34a',
  },
  headerBar: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 10 : 0,
    paddingBottom: 12,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: Platform.OS === 'android' ? 10 : 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#dcfce7',
    fontSize: 14,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 14,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  stepCircleActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  stepNumber: {
    color: '#dcfce7',
    fontWeight: '800',
  },
  stepNumberActive: {
    color: '#16a34a',
  },
  stepLine: {
    flex: 1,
    height: 3,
    backgroundColor: '#dcfce7',
    marginLeft: 8,
    marginRight: 8,
    opacity: 0.5,
  },
  stepLineActive: {
    backgroundColor: '#ffffff',
    opacity: 1,
  },
  content: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  stepScreen: {
    minHeight: 1,
  },
  stepHeader: {
    marginBottom: 16,
  },
  afterButtonSpacer: {
    height: 64,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  label: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '700',
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#f9fafb',
    marginTop: 8,
    marginBottom: 10,
  },
  textarea: {
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 6,
  },
  switchLabel: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 10,
  },
  imagesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  imageItem: {
    width: 96,
    height: 96,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  previewThumb: {
    width: '100%',
    height: '100%',
  },
  removeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '800',
  },
  addThumb: {
    width: 96,
    height: 96,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcfce7',
  },
  addThumbText: {
    color: '#16a34a',
    fontSize: 28,
    fontWeight: '800',
  },
  imagePickerButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  imagePickerText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 20,
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  navDisabled: {
    opacity: 0.6,
  },
  navText: {
    color: '#111827',
    fontWeight: '700',
  },
  navButtonPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#16a34a',
  },
  navTextPrimary: {
    color: '#ffffff',
    fontWeight: '700',
  },
  submitButton: {
    marginTop: 24,
    backgroundColor: '#16a34a',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});


