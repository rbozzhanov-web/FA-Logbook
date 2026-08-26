import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { createElement, useCallback, useRef, useState } from 'react';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { ExtractedPage } from './types';

const pdfjsDir = new Directory(Paths.cache, 'pdfjs');

// The pdf.js sources carry a .txt suffix purely so Metro bundles them as opaque assets: .mjs has
// to stay a *source* extension, since node_modules ships real ESM under it (expo's own
// whatwg-url-minimum among them) that must be compiled into the JS bundle, not shipped as files.
// They're written back out as .mjs below, which is the name viewer.html imports.
const HARNESS_FILES: [number, string][] = [
  [require('../../../assets/pdfjs/viewer.html'), 'viewer.html'],
  [require('../../../assets/pdfjs/pdf.min.mjs.txt'), 'pdf.min.mjs'],
  [require('../../../assets/pdfjs/pdf.worker.min.mjs.txt'), 'pdf.worker.min.mjs'],
];

/**
 * Copies the bundled pdf.js harness (HTML + the library + its worker) into a real filesystem
 * directory so the WebView can load them all via file:// with working relative imports between
 * them — Expo's asset system doesn't guarantee co-located files land in the same served
 * location, so this makes that guarantee explicit.
 */
async function ensureHarnessOnDisk(): Promise<string> {
  if (!pdfjsDir.exists) pdfjsDir.create({ intermediates: true, idempotent: true });

  for (const [assetModule, filename] of HARNESS_FILES) {
    const dest = new File(pdfjsDir, filename);
    if (dest.exists) continue;

    const asset = Asset.fromModule(assetModule);
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error(`Could not resolve local URI for bundled asset: ${filename}`);
    await new File(asset.localUri).copy(dest);
  }

  return new File(pdfjsDir, 'viewer.html').uri;
}

interface PendingExtraction {
  resolve: (pages: ExtractedPage[]) => void;
  reject: (error: Error) => void;
}

interface HarnessMessage {
  type: 'ready' | 'result';
  ok?: boolean;
  pages?: ExtractedPage[];
  error?: string;
}

/**
 * Runs pdf.js inside a hidden WebView to extract each page's text with x/y positions — the
 * generic pdfjs-dist package can't run directly in Hermes (dynamic worker import), so this uses
 * the WebView's own browser JS engine instead. Render `webViewElement` somewhere in the tree
 * (it renders as 0x0) and call `extractText(base64Pdf)` once it's mounted.
 */
export function usePdfTextExtractor() {
  const webViewRef = useRef<WebView>(null);
  const [harnessUri, setHarnessUri] = useState<string>();
  const readyPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const readyResolveRef = useRef<(() => void) | undefined>(undefined);
  const pendingRef = useRef<PendingExtraction | undefined>(undefined);

  const ensureReady = useCallback(async (): Promise<void> => {
    if (!readyPromiseRef.current) {
      readyPromiseRef.current = new Promise((resolve) => {
        readyResolveRef.current = resolve;
      });
    }
    if (!harnessUri) {
      const uri = await ensureHarnessOnDisk();
      setHarnessUri(uri);
    }
    return readyPromiseRef.current;
  }, [harnessUri]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let message: HarnessMessage;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (message.type === 'ready') {
      readyResolveRef.current?.();
      return;
    }

    if (message.type === 'result') {
      const pending = pendingRef.current;
      pendingRef.current = undefined;
      if (!pending) return;
      if (message.ok && message.pages) pending.resolve(message.pages);
      else pending.reject(new Error(message.error ?? 'PDF extraction failed'));
    }
  }, []);

  const extractText = useCallback(
    async (base64Pdf: string): Promise<ExtractedPage[]> => {
      await ensureReady();
      if (!webViewRef.current) throw new Error('PDF extraction view is not mounted');

      return new Promise<ExtractedPage[]>((resolve, reject) => {
        pendingRef.current = { resolve, reject };
        webViewRef.current!.injectJavaScript(`window.extractPdfText(${JSON.stringify(base64Pdf)}); true;`);
      });
    },
    [ensureReady],
  );

  const webViewElement = harnessUri
    ? createElement(WebView, {
        ref: webViewRef,
        source: { uri: harnessUri },
        onMessage,
        originWhitelist: ['*'],
        javaScriptEnabled: true,
        allowFileAccess: true,
        allowFileAccessFromFileURLs: true,
        allowUniversalAccessFromFileURLs: true,
        allowingReadAccessToURL: pdfjsDir.uri,
        style: { width: 0, height: 0 },
      })
    : null;

  return { extractText, webViewElement, ensureReady };
}
