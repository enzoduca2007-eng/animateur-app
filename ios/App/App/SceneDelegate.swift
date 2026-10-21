import UIKit
import Capacitor

// Dans WKWebView, window.print() ne fait rien : ce plugin ouvre la boîte
// d'impression iOS sur la page affichée (CSS @media print compris).
// Appelé depuis src/lib/impression.ts. Déclaré ici plutôt que dans un
// fichier à part pour ne pas avoir à toucher au projet Xcode.
@objc(ImpressionPlugin)
public class ImpressionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ImpressionPlugin"
    public let jsName = "Impression"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "imprimer", returnType: CAPPluginReturnPromise)
    ]

    @objc func imprimer(_ call: CAPPluginCall) {
        let orientation = call.getString("orientation") ?? "portrait"
        let titre = call.getString("titre") ?? "Document"

        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                call.reject("Impression indisponible")
                return
            }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = titre
            info.orientation = orientation == "landscape" ? .landscape : .portrait

            let controleur = UIPrintInteractionController.shared
            controleur.printInfo = info
            controleur.printFormatter = webView.viewPrintFormatter()
            controleur.present(animated: true) { _, _, _ in
                call.resolve()
            }
        }
    }
}

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ImpressionPlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
