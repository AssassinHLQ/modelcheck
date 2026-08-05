"""
在 Rhino 8 中批量转换 SolidWorks 文件 (.sldprt / .sldasm) 为 STEP

用法：
1. 打开 Rhino 8
2. 菜单 工具 -> PythonScript -> 编辑  (或命令栏输入 _RunPythonScript)
3. 选择本文件运行，按提示选择文件夹
4. 转换完成后，把生成的 .step 文件拖入 3D 模型查看器即可查看

原理：Rhino 自带 SolidWorks 文件导入器（需要 Windows 版 Rhino），
脚本逐个打开 .sldprt/.sldasm 并导出为 STEP。
"""

import os
import rhinoscriptsyntax as rs
import scriptcontext as sc

EXTENSIONS = (".sldprt", ".sldasm")


def collect_files(folder):
    files = []
    for root, _dirs, names in os.walk(folder):
        for name in names:
            if name.lower().endswith(EXTENSIONS):
                files.append(os.path.join(root, name))
    return files


def main():
    folder = rs.BrowseForFolder(None, "选择包含 SolidWorks 文件的文件夹")
    if not folder:
        print("已取消")
        return

    out_folder = rs.BrowseForFolder(None, "选择输出文件夹（取消则输出到原文件夹）")
    if not out_folder:
        out_folder = folder

    files = collect_files(folder)
    if not files:
        rs.MessageBox("该文件夹中没有找到 .sldprt / .sldasm 文件", 48, "提示")
        return

    ok, fail = 0, 0
    for f in files:
        base = os.path.splitext(os.path.basename(f))[0]
        out = os.path.join(out_folder, base + ".step")
        print("转换中：%s" % f)
        rs.Command('_-Open "%s" _Enter' % f)
        rs.SelectAll()
        if rs.UnitSystem() != 8:  # 8 = millimeters
            rs.Command("_-Units _-Enter _Millimeters _Enter")
        rs.Command('_-Export "%s" _Enter' % out)
        if os.path.exists(out):
            print("  -> 完成：%s" % out)
            ok += 1
        else:
            print("  -> 失败：%s" % f)
            fail += 1
        rs.Command("_-New _Enter")

    rs.MessageBox("转换完成：成功 %d 个，失败 %d 个" % (ok, fail), 64, "完成")


if __name__ == "__main__":
    main()
