import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal, Alert, ScrollView,
  ActivityIndicator, TextInput
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { C } from './theme';
import { Btn, Input, Label, s } from './ui';
import { searchCatalogue, countCatalogue, importExcelData } from './db';
import {
  getTradeNestConfig, saveTradeNestConfig, runTradeNestSync
} from './tradenest';

export default function ProductsScreen({ app }) {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ products: 0, barcodes: 0 });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Modals
  const [settingsModal, setSettingsModal] = useState(false);
  const [tnConfig, setTnConfig] = useState({ storeId: '', user: '', password: '', autoSync: true, lastSync: null });

  // Excel mapping modal state
  const [excelModal, setExcelModal] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [excelColumns, setExcelColumns] = useState([]);
  const [excelRows, setExcelRows] = useState([]);
  const [mapping, setMapping] = useState({ nameKey: '', barcodeKey: '', priceKey: '', stockKey: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [results, c] = await Promise.all([
        searchCatalogue(q, 60),
        countCatalogue(),
      ]);
      setItems(results);
      setStats(c);
    } catch (e) {
      console.warn('loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    loadData();
  }, [loadData, app.rev]);

  useEffect(() => {
    getTradeNestConfig().then(setTnConfig);
  }, []);

  // ---------------- Excel File Picker & Auto Detection ----------------
  const pickExcelFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/octet-stream',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || !res.assets[0]) return;
      const file = res.assets[0];

      setSyncing(true);
      setSyncMsg('Reading spreadsheet...');

      const b64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const workbook = XLSX.read(b64, { type: 'base64' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert to array of objects
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!rawRows || rawRows.length === 0) {
        Alert.alert('Empty File', 'No rows found in the selected spreadsheet.');
        setSyncing(false);
        return;
      }

      // If row 0 looks like a report title, check if row 1 is the header
      let rows = rawRows;
      let cols = Object.keys(rows[0] || {});
      const looksLikeTitle = cols.some((c) => c.toLowerCase().includes('report') && cols.length <= 3);
      if (looksLikeTitle) {
        // Parse with range starting at row 1
        rows = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: '' });
        cols = Object.keys(rows[0] || {});
      }

      // Auto-detect matching column names
      const findCol = (candidates) => {
        for (const cand of candidates) {
          const match = cols.find((c) => c.trim().toLowerCase() === cand);
          if (match) return match;
        }
        for (const cand of candidates) {
          const match = cols.find((c) => c.trim().toLowerCase().includes(cand));
          if (match) return match;
        }
        return cols[0] || '';
      };

      const detectedName = findCol(['product name', 'item name', 'name', 'product', 'item', 'description']);
      const detectedBarcode = findCol(['barcode', 's2_barcode', 'bar_code', 'code', 'item code']);
      const detectedPrice = findCol(['sale price', 'bar_sale_price', 'price', 'rate', 'sp', 'mrp']);
      const detectedStock = findCol(['balance qty', 'stock', 'qty', 'balance', 'quantity']);

      setExcelFile(file);
      setExcelColumns(cols);
      setExcelRows(rows);
      setMapping({
        nameKey: detectedName,
        barcodeKey: detectedBarcode,
        priceKey: detectedPrice,
        stockKey: detectedStock,
      });
      setExcelModal(true);
    } catch (err) {
      Alert.alert('Failed to read Excel', String(err.message || err));
    } finally {
      setSyncing(false);
    }
  };

  const executeExcelImport = async () => {
    if (!mapping.nameKey && !mapping.barcodeKey) {
      return Alert.alert('Invalid Selection', 'Please select at least Product Name or Barcode column.');
    }
    setExcelModal(false);
    setSyncing(true);
    try {
      const res = await importExcelData(excelRows, mapping, (msg) => setSyncMsg(msg));
      app.bump();
      Alert.alert(
        'Import Successful! 🎉',
        `Processed ${res.total} rows.\n• Matched with Catalogue: ${res.matched}\n• New Products Created: ${res.newProductsCreated}\n• Barcodes & Rates Added: ${res.barcodesAdded}`
      );
    } catch (err) {
      Alert.alert('Import Failed', String(err.message || err));
    } finally {
      setSyncing(false);
      loadData();
    }
  };

  // ---------------- TradeNest Direct Sync ----------------
  const handleTradeNestSync = async () => {
    if (!tnConfig.storeId || !tnConfig.user || !tnConfig.password) {
      setSettingsModal(true);
      return;
    }
    setSyncing(true);
    try {
      const res = await runTradeNestSync((msg) => setSyncMsg(msg));
      app.bump();
      Alert.alert(
        'TradeNest Sync Complete! 🔄',
        `Synchronized ${res.productsCount} products and ${res.barcodesCount} barcodes.`
      );
      getTradeNestConfig().then(setTnConfig);
    } catch (err) {
      Alert.alert('Sync Failed', String(err.message || err));
    } finally {
      setSyncing(false);
      loadData();
    }
  };

  const saveConfigAndSync = async () => {
    await saveTradeNestConfig(tnConfig);
    setSettingsModal(false);
    handleTradeNestSync();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Top Header */}
      <View style={{ padding: 14, backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>📦 Products & Stock</Text>
            <Text style={{ color: C.sub, fontSize: 11, marginTop: 2 }}>
              {stats.products} products · {stats.barcodes} barcode rates
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Btn small title="📥 Excel" onPress={pickExcelFile} />
            <Btn small kind="ghost" title="🔄 Sync" onPress={handleTradeNestSync} />
            <TouchableOpacity
              onPress={() => setSettingsModal(true)}
              style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <Text style={{ fontSize: 16 }}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Input */}
        <Input
          placeholder="Search name, barcode, or code..."
          value={q}
          onChangeText={setQ}
          style={{ marginBottom: 0 }}
        />
      </View>

      {/* Syncing Overlay */}
      {syncing && (
        <View style={{ padding: 12, backgroundColor: 'rgba(47,109,240,0.15)', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={C.accent} size="small" />
          <Text style={{ color: C.text, fontSize: 12, fontWeight: '600', flex: 1 }}>{syncMsg || 'Working...'}</Text>
        </View>
      )}

      {/* Product List */}
      {loading && !syncing ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.pro_id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 50, paddingHorizontal: 30 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📦</Text>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
                No products found
              </Text>
              <Text style={{ color: C.sub, textAlign: 'center', marginTop: 6, fontSize: 13 }}>
                Tap "📥 Excel" to import your stock report, or "🔄 Sync" to connect to TradeNest.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{
              backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 8,
              borderWidth: 1, borderColor: C.border
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 }}>
                  {item.pro_name}
                </Text>
                {!!item.pro_code && (
                  <Text style={{ color: C.sub, fontSize: 11, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    Code: {item.pro_code}
                  </Text>
                )}
              </View>

              {/* Barcodes & Rates */}
              <View style={{ marginTop: 8 }}>
                {(!item.barcodes || item.barcodes.length === 0) ? (
                  <Text style={{ color: C.sub, fontSize: 11 }}>No barcodes assigned</Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {item.barcodes.map((b, idx) => (
                      <View key={idx} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: 'rgba(77,141,255,0.08)', borderColor: 'rgba(77,141,255,0.25)',
                        borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6
                      }}>
                        <Text style={{ color: C.accent, fontSize: 11, fontWeight: '700' }}>
                          ₹{b.sp.toFixed(2)}
                        </Text>
                        <Text style={{ color: C.sub, fontSize: 11 }}>
                          {b.barcode}
                        </Text>
                        {b.stock_qty > 0 && (
                          <Text style={{ color: C.good, fontSize: 10, fontWeight: '600' }}>
                            ({b.stock_qty} in stock)
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}
        />
      )}

      {/* ---------------- Excel Column Mapping Modal ---------------- */}
      <Modal visible={excelModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '88%' }}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 4 }}>
              📥 Map Excel Columns
            </Text>
            <Text style={{ color: C.sub, fontSize: 12, marginBottom: 16 }}>
              {excelFile?.name} ({excelRows.length} rows found). Choose which column matches each field:
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Product Name Column */}
              <Label text="PRODUCT NAME COLUMN *" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {excelColumns.map((col) => (
                  <TouchableOpacity
                    key={col}
                    onPress={() => setMapping({ ...mapping, nameKey: col })}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                      backgroundColor: mapping.nameKey === col ? C.accent : 'rgba(255,255,255,0.06)',
                      borderWidth: 1, borderColor: mapping.nameKey === col ? C.accent : C.border,
                    }}>
                    <Text style={{ color: mapping.nameKey === col ? '#fff' : C.text, fontSize: 11, fontWeight: '600' }}>
                      {col}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Barcode Column */}
              <Label text="BARCODE COLUMN *" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {excelColumns.map((col) => (
                  <TouchableOpacity
                    key={col}
                    onPress={() => setMapping({ ...mapping, barcodeKey: col })}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                      backgroundColor: mapping.barcodeKey === col ? C.accent : 'rgba(255,255,255,0.06)',
                      borderWidth: 1, borderColor: mapping.barcodeKey === col ? C.accent : C.border,
                    }}>
                    <Text style={{ color: mapping.barcodeKey === col ? '#fff' : C.text, fontSize: 11, fontWeight: '600' }}>
                      {col}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Sale Price / Rate Column */}
              <Label text="SELLING PRICE / RATE COLUMN" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {excelColumns.map((col) => (
                  <TouchableOpacity
                    key={col}
                    onPress={() => setMapping({ ...mapping, priceKey: col })}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                      backgroundColor: mapping.priceKey === col ? C.accent : 'rgba(255,255,255,0.06)',
                      borderWidth: 1, borderColor: mapping.priceKey === col ? C.accent : C.border,
                    }}>
                    <Text style={{ color: mapping.priceKey === col ? '#fff' : C.text, fontSize: 11, fontWeight: '600' }}>
                      {col}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Stock Balance Column */}
              <Label text="CURRENT STOCK / BALANCE QTY COLUMN" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                {excelColumns.map((col) => (
                  <TouchableOpacity
                    key={col}
                    onPress={() => setMapping({ ...mapping, stockKey: col })}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                      backgroundColor: mapping.stockKey === col ? C.accent : 'rgba(255,255,255,0.06)',
                      borderWidth: 1, borderColor: mapping.stockKey === col ? C.accent : C.border,
                    }}>
                    <Text style={{ color: mapping.stockKey === col ? '#fff' : C.text, fontSize: 11, fontWeight: '600' }}>
                      {col}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Action Buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Btn kind="ghost" title="Cancel" onPress={() => setExcelModal(false)} style={{ flex: 1 }} />
                <Btn title="Start Import" onPress={executeExcelImport} style={{ flex: 2 }} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------------- TradeNest API Settings Modal ---------------- */}
      <Modal visible={settingsModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 4 }}>
              🔄 TradeNest API Settings
            </Text>
            <Text style={{ color: C.sub, fontSize: 12, marginBottom: 16 }}>
              Enter your login to automatically sync products at 12 PM, 5 PM & Midnight.
            </Text>

            <Label text="STORE ID (TN_STORE_ID)" />
            <Input
              placeholder="e.g. 2609031245384320"
              value={tnConfig.storeId}
              onChangeText={(t) => setTnConfig({ ...tnConfig, storeId: t.trim() })}
            />

            <Label text="USER ID / USERNAME (TN_USER)" />
            <Input
              placeholder="e.g. admin"
              value={tnConfig.user}
              onChangeText={(t) => setTnConfig({ ...tnConfig, user: t.trim() })}
            />

            <Label text="PASSWORD (TN_PASSWORD)" />
            <Input
              secureTextEntry
              placeholder="••••••••"
              value={tnConfig.password}
              onChangeText={(t) => setTnConfig({ ...tnConfig, password: t.trim() })}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12 }}>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>
                Auto-sync on app open (12 PM, 5 PM, 12 AM)
              </Text>
              <TouchableOpacity
                onPress={() => setTnConfig({ ...tnConfig, autoSync: !tnConfig.autoSync })}
                style={{
                  width: 44, height: 26, borderRadius: 13,
                  backgroundColor: tnConfig.autoSync ? C.good : 'rgba(255,255,255,0.2)',
                  padding: 2, justifyContent: 'center', alignItems: tnConfig.autoSync ? 'flex-end' : 'flex-start'
                }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <Btn kind="ghost" title="Close" onPress={() => setSettingsModal(false)} style={{ flex: 1 }} />
              <Btn title="Save & Sync Now" onPress={saveConfigAndSync} style={{ flex: 2 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
