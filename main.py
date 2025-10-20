import sys
import os
import json
from PyQt5.QtWidgets import QApplication, QMainWindow
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtWebChannel import QWebChannel
from PyQt5.QtCore import QObject, pyqtSlot

MAP_DATA_PATH = "drawn_map.geojson"

class Bridge(QObject):
    @pyqtSlot(result=str)
    def autoload(self):
        if os.path.exists(MAP_DATA_PATH):
            with open(MAP_DATA_PATH, "r", encoding="utf-8") as f:
                return f.read()
        return ""
    
    @pyqtSlot(str)
    def autosave(self, geojson):
        with open(MAP_DATA_PATH, "w", encoding="utf-8") as f:
            f.write(geojson)

class MapDrawModern(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Modern Map Drawer")
        self.resize(1280, 800)
        self.view = QWebEngineView()
        self.setCentralWidget(self.view)

        # Setup WebChannel for JS<->Python bridge
        self.channel = QWebChannel()
        self.bridge = Bridge()
        self.channel.registerObject('bridge', self.bridge)
        self.view.page().setWebChannel(self.channel)

        # Load local index.html (make sure relative paths work!)
        local_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "index.html"))
        self.view.load(QUrl.fromLocalFile(local_file))

if __name__ == "__main__":
    from PyQt5.QtCore import QUrl
    app = QApplication(sys.argv)
    w = MapDrawModern()
    w.show()
    sys.exit(app.exec_())
