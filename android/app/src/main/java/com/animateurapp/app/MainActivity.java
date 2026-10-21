package com.animateurapp.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locaux : à enregistrer avant super.onCreate().
        registerPlugin(ImpressionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
