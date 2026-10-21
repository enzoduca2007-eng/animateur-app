package com.animateurapp.app;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Dans la WebView Android, window.print() ne fait rien : ce plugin ouvre la
 * boîte d'impression du système sur la page affichée (CSS @media print
 * compris). Appelé depuis src/lib/impression.ts.
 */
@CapacitorPlugin(name = "Impression")
public class ImpressionPlugin extends Plugin {

    @PluginMethod
    public void imprimer(PluginCall call) {
        String orientation = call.getString("orientation", "portrait");
        String titre = call.getString("titre", "Document");

        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            PrintManager printManager =
                (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
            if (webView == null || printManager == null) {
                call.reject("Impression indisponible");
                return;
            }

            PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(titre);
            PrintAttributes attributs = new PrintAttributes.Builder()
                .setMediaSize(
                    "landscape".equals(orientation)
                        ? PrintAttributes.MediaSize.ISO_A4.asLandscape()
                        : PrintAttributes.MediaSize.ISO_A4.asPortrait()
                )
                .build();

            // Adaptateur relais : résout l'appel JS une fois la boîte
            // d'impression fermée (imprimé ou annulé).
            printManager.print(titre, new PrintDocumentAdapter() {
                @Override
                public void onStart() {
                    adapter.onStart();
                }

                @Override
                public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes,
                                     CancellationSignal cancellationSignal,
                                     LayoutResultCallback callback, Bundle extras) {
                    adapter.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
                }

                @Override
                public void onWrite(PageRange[] pages, ParcelFileDescriptor destination,
                                    CancellationSignal cancellationSignal,
                                    WriteResultCallback callback) {
                    adapter.onWrite(pages, destination, cancellationSignal, callback);
                }

                @Override
                public void onFinish() {
                    adapter.onFinish();
                    call.resolve();
                }
            }, attributs);
        });
    }
}
