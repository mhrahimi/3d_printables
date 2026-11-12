"""Offscreen renders (VTK/EGL) of CadQuery shapes, for review images."""
from __future__ import annotations

import math

import vtk
import cadquery as cq

PALETTE = {
    "case": (0.30, 0.32, 0.35),
    "case2": (0.42, 0.44, 0.48),
    "light": (0.80, 0.82, 0.85),
    "drawer": (0.93, 0.48, 0.16),
    "drawer2": (0.98, 0.70, 0.30),
    "base": (0.45, 0.47, 0.50),
    "divider": (0.95, 0.85, 0.55),
    "accent": (0.30, 0.75, 0.70),
    "red": (0.85, 0.20, 0.20),
}


def _polydata(shape: cq.Shape, tol=0.05, ang=0.2):
    verts, tris = shape.tessellate(tol, ang)
    pts = vtk.vtkPoints()
    for v in verts:
        pts.InsertNextPoint(v.x, v.y, v.z)
    cells = vtk.vtkCellArray()
    for t in tris:
        cells.InsertNextCell(3)
        for i in t:
            cells.InsertCellPoint(i)
    pd = vtk.vtkPolyData()
    pd.SetPoints(pts)
    pd.SetPolys(cells)
    clean = vtk.vtkCleanPolyData()
    clean.SetInputData(pd)
    clean.Update()
    return clean.GetOutput()


def render(items, path, view=(1, 1, -1), up=(0, 1, 0), size=(1400, 1000), zoom=1.0,
           edges=True, focus=None, parallel=False, bg=(1, 1, 1), elevation=None):
    """items: list of (shape, rgb, opacity).  view: direction from target to camera."""
    ren = vtk.vtkRenderer()
    ren.SetBackground(*bg)
    win = vtk.vtkRenderWindow()
    win.SetOffScreenRendering(1)
    win.SetSize(*size)
    win.AddRenderer(ren)
    win.SetMultiSamples(8)
    for shape, rgb, alpha in items:
        pd = _polydata(shape)
        nrm = vtk.vtkPolyDataNormals()
        nrm.SetInputData(pd)
        nrm.SetFeatureAngle(35)
        nrm.SplittingOn()
        nrm.Update()
        m = vtk.vtkPolyDataMapper()
        m.SetInputConnection(nrm.GetOutputPort())
        m.ScalarVisibilityOff()
        a = vtk.vtkActor()
        a.SetMapper(m)
        pr = a.GetProperty()
        pr.SetColor(*rgb)
        pr.SetOpacity(alpha)
        pr.SetAmbient(0.25)
        pr.SetDiffuse(0.75)
        pr.SetSpecular(0.15)
        pr.SetSpecularPower(20)
        ren.AddActor(a)
        if edges and alpha > 0.5:
            fe = vtk.vtkFeatureEdges()
            fe.SetInputData(pd)
            fe.BoundaryEdgesOn()
            fe.FeatureEdgesOn()
            fe.SetFeatureAngle(30)
            fe.ManifoldEdgesOff()
            fe.NonManifoldEdgesOff()
            fe.ColoringOff()
            em = vtk.vtkPolyDataMapper()
            em.SetInputConnection(fe.GetOutputPort())
            ea = vtk.vtkActor()
            ea.SetMapper(em)
            ea.GetProperty().SetColor(0.05, 0.05, 0.05)
            ea.GetProperty().SetLineWidth(1.2)
            ren.AddActor(ea)
    light = vtk.vtkLight()
    light.SetLightTypeToCameraLight()
    light.SetPosition(0.4, 0.6, 1)
    ren.AddLight(light)
    ren.ResetCamera()
    cam = ren.GetActiveCamera()
    if focus is None:
        b = ren.ComputeVisiblePropBounds()
        focus = ((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2)
        radius = math.dist((b[0], b[2], b[4]), (b[1], b[3], b[5])) / 2
    else:
        focus, radius = focus[:3], focus[3]
    d = math.sqrt(sum(c * c for c in view))
    dist = radius / math.tan(math.radians(15)) / zoom
    cam.SetFocalPoint(*focus)
    cam.SetPosition(*(focus[i] + view[i] / d * dist for i in range(3)))
    cam.SetViewUp(*up)
    cam.SetViewAngle(30)
    if parallel:
        cam.ParallelProjectionOn()
        cam.SetParallelScale(radius / zoom)
    ren.ResetCameraClippingRange()
    win.Render()
    w2i = vtk.vtkWindowToImageFilter()
    w2i.SetInput(win)
    w2i.ReadFrontBufferOff()
    w2i.Update()
    wr = vtk.vtkPNGWriter()
    wr.SetFileName(str(path))
    wr.SetInputConnection(w2i.GetOutputPort())
    wr.Write()
    return path
