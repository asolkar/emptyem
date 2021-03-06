/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Empty 'em.
 *
 * The Initial Developer of the Original Code is
 * Mahesh Asolkar.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

function init() {
 var event = { notify: function(timer) {  } }

  // Now it is time to create the timer...
  var timer
    = Components.classes["@mozilla.org/timer;1"]
       .createInstance(Components.interfaces.nsITimer);

  // ... and to initialize it, we want to call event.notify() ...
  // ... one time after exactly ten second.
  timer.initWithCallback(
  {
    notify: function(timer) {
      var version = document.getElementById("emptyem-about-version");
      var use_old_addon_manager = 0;

      try {
        Components.utils.import("resource://gre/modules/AddonManager.jsm");
      } catch (ex) {
        use_old_addon_manager = 1;
      }
      if (use_old_addon_manager == 0) {
        Application.console.log ("[Empty 'em] Using new AddonManager");
        AddonManager.getAddonByID(
          'emptyem@mahesh.asolkar',
          function (addon) {
            version.attributes["value"].nodeValue = addon.version;
          });
      } else {
        Application.console.log ("[Empty 'em] Using old AddonManager");
        var extManager = Components.classes["@mozilla.org/extensions/manager;1"]
                          .getService(Components.interfaces.nsIExtensionManager);
        var addon = extManager.getItemForID("emptyem@mahesh.asolkar");
        version.attributes["value"].nodeValue = addon.version;
      }
    }
  },
  0,
  Components.interfaces.nsITimer.TYPE_ONE_SHOT);
  sizeToContent();
}

